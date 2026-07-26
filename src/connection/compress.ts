import type * as net from "net";
import type * as tls from "tls";
import * as zlib from "zlib";

import type NewlineTranform from "../newline.transform";

/**
 * RFC 4978 (COMPRESS=DEFLATE) stream topology: wraps an ALREADY-established
 * socket (plain or TLS -- COMPRESS layers underneath TLS on the wire per
 * RFC4978-3-4/-3-5, so this works identically against either transport) in
 * a raw-DEFLATE (RFC 1951, no zlib/gzip header) Transform pair. Modeled on
 * `Connection.starttls()`'s socket-swap choreography (`connection.ts`), but
 * COMPRESS never replaces the socket itself the way STARTTLS does -- it
 * interposes a codec on BOTH directions of the SAME socket:
 *
 *   read:  socket -> inflate -> processingPipeline
 *   write: writer  -> deflate -> socket
 *
 * `createInflateRaw`/`createDeflateRaw` are mandatory here, not
 * `createInflate`/`createDeflate`: RFC 4978 §5's ABNF defines the algorithm
 * as bare DEFLATE (RFC 1951), and the header-bearing zlib variant
 * (RFC 1950) would desync against any real server (or this library's own
 * server-side test doubles) speaking raw DEFLATE.
 */
export interface CompressionLayer {
	/**
	 * Compresses `buf` and writes it to the socket, then flushes so it
	 * reaches the wire immediately instead of sitting in zlib's internal
	 * buffer. RFC 4978 defines no message-boundary framing of its own for
	 * the compressed stream, so command boundaries only stay observable on
	 * the wire if every write is its own flush boundary -- `Z_SYNC_FLUSH`
	 * (not `Z_FULL_FLUSH`/`Z_FINISH`, which would reset/end the stream)
	 * flushes pending output without discarding the compression context a
	 * later write still depends on.
	 */
	write(buf: Buffer): void;
	/** Unhooks and destroys both transforms. Does NOT touch the socket
	 *  itself -- the caller (`Connection`) owns that lifecycle. */
	destroy(): void;
}

/**
 * Decompression-bomb ceiling (defense-in-depth, no RFC citation -- RFC 4978
 * itself has nothing to say about malicious peers): a malicious/compromised
 * server can advertise COMPRESS=DEFLATE and then send a tiny compressed
 * frame that inflates to gigabytes, exhausting memory with a handful of
 * wire bytes. There is no natural per-message framing to bound this against
 * (RFC 4978's compressed stream is continuous, not chunked per response),
 * so this is an absolute cap on TOTAL decompressed output for the lifetime
 * of one `wrapCompression()` call (i.e. one COMPRESS activation -- reset by
 * every fresh `compress()`/`unauthenticate()` cycle). Generous enough that
 * no realistic IMAP session (even one fetching many/large message bodies
 * over a single long-lived compressed connection) should ever legitimately
 * approach it; small enough that a genuine bomb is caught well before
 * exhausting typical process memory.
 */
export const DEFAULT_MAX_INFLATED_BYTES = 256 * 1024 * 1024; // 256 MiB

/**
 * `onError` receives any 'error' emitted by either transform (e.g.
 * malformed compressed data arriving from the peer, or the decompression-
 * bomb guard below tripping) -- the caller is expected to route it through
 * the same failure path a broken socket would take (never an unhandled
 * 'error' event).
 *
 * `initialCompressedBytes` (M10 fix): bytes captured by
 * `NewlineTranform.endOpaqueCapture()` between COMPRESS's own tagged OK
 * routing and this function actually being called -- the socket is still
 * PLAIN at the instant those bytes arrived (this function hasn't interposed
 * `inflate` yet), so they were never decompressed; per RFC 4978, the
 * server's own outgoing compression activates immediately after ITS tagged
 * OK, meaning these are genuinely the OPENING bytes of the now-compressed
 * stream, not injected/untrusted residue (contrast STARTTLS, which replaces
 * the socket entirely and can safely discard residual plaintext instead).
 * Fed into `inflate` synchronously, before this function returns control to
 * the event loop -- guaranteed to land ahead of anything the live
 * `socket.pipe(inflate)` wiring below delivers on a later tick, preserving
 * DEFLATE's strictly-ordered decompression stream.
 */
export function wrapCompression(
	socket: net.Socket | tls.TLSSocket,
	processingPipeline: NewlineTranform,
	onError: (err: Error) => void,
	maxInflatedBytes: number = DEFAULT_MAX_INFLATED_BYTES,
	initialCompressedBytes?: Buffer,
): CompressionLayer {
	const inflate = zlib.createInflateRaw();
	const deflate = zlib.createDeflateRaw();

	inflate.on("error", onError);
	deflate.on("error", onError);

	// Decompression-bomb guard: tracks cumulative decompressed output and
	// destroys `inflate` once it crosses `maxInflatedBytes` -- `destroy(err)`
	// emits 'error' on `inflate` itself, routing through the SAME `onError`
	// wired immediately above (and therefore the same teardown path a
	// malformed-data codec error already takes) rather than needing a
	// separate failure channel.
	let inflatedBytes = 0;
	inflate.on("data", (chunk: Buffer) => {
		inflatedBytes += chunk.length;
		if (inflatedBytes > maxInflatedBytes) {
			inflate.destroy(
				new Error(
					`COMPRESS (RFC 4978) decompressed output exceeded the ` +
						`${maxInflatedBytes}-byte safety cap -- refusing to keep ` +
						`inflating (possible decompression-bomb DoS from the server)`,
				),
			);
		}
	});

	// Read direction: decompress everything the socket delivers before it
	// ever reaches the newline splitter.
	socket.pipe(inflate).pipe(processingPipeline);
	// Write direction: `write()` below feeds `deflate`, which streams its
	// compressed output straight to the socket as it's produced.
	deflate.pipe(socket);

	// M10 fix: see this function's own doc comment above.
	if (initialCompressedBytes && initialCompressedBytes.length) {
		inflate.write(initialCompressedBytes);
	}

	return {
		write(buf: Buffer): void {
			deflate.write(buf);
			deflate.flush(zlib.constants.Z_SYNC_FLUSH);
		},
		destroy(): void {
			socket.unpipe(inflate);
			inflate.unpipe(processingPipeline);
			deflate.unpipe(socket);
			inflate.destroy();
			deflate.destroy();
		},
	};
}
