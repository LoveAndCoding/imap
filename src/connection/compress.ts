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
 * `onError` receives any 'error' emitted by either transform (e.g.
 * malformed compressed data arriving from the peer) -- the caller is
 * expected to route it through the same failure path a broken socket would
 * take (never an unhandled 'error' event).
 */
export function wrapCompression(
	socket: net.Socket | tls.TLSSocket,
	processingPipeline: NewlineTranform,
	onError: (err: Error) => void,
): CompressionLayer {
	const inflate = zlib.createInflateRaw();
	const deflate = zlib.createDeflateRaw();

	inflate.on("error", onError);
	deflate.on("error", onError);

	// Read direction: decompress everything the socket delivers before it
	// ever reaches the newline splitter.
	socket.pipe(inflate).pipe(processingPipeline);
	// Write direction: `write()` below feeds `deflate`, which streams its
	// compressed output straight to the socket as it's produced.
	deflate.pipe(socket);

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
