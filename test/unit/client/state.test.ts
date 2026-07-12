import {
	ClientState,
	ClientStateMachine,
	IllegalStateError,
	IllegalStateTransitionError,
} from "../../../src/client/state";

/** Drives `machine` through a sequence of legal transitions. */
function advance(machine: ClientStateMachine, path: readonly ClientState[]) {
	for (const to of path) {
		machine.transition(to);
	}
}

describe("ClientStateMachine", () => {
	test("starts disconnected", () => {
		const machine = new ClientStateMachine();
		expect(machine.current).toBe("disconnected");
	});

	describe("legal edges (§3.1)", () => {
		test("disconnected -> connecting (connect() called)", () => {
			const machine = new ClientStateMachine();
			machine.transition("connecting");
			expect(machine.current).toBe("connecting");
		});

		test("connecting -> not-authenticated (OK greeting, no auth)", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "not-authenticated"]);
			expect(machine.current).toBe("not-authenticated");
		});

		test("connecting -> authenticated (OK greeting + auth, or PREAUTH)", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "authenticated"]);
			expect(machine.current).toBe("authenticated");
		});

		test("connecting -> disconnected (BYE greeting / TLS or policy failure)", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "disconnected"]);
			expect(machine.current).toBe("disconnected");
		});

		test("not-authenticated -> authenticated (authenticate() success)", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "not-authenticated", "authenticated"]);
			expect(machine.current).toBe("authenticated");
		});

		test("authenticated -> selected (select()/examine() OK)", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "authenticated", "selected"]);
			expect(machine.current).toBe("selected");
		});

		test("selected -> authenticated (close()/unselect()/CLOSED/reselect-begin)", () => {
			const machine = new ClientStateMachine();
			advance(machine, [
				"connecting",
				"authenticated",
				"selected",
				"authenticated",
			]);
			expect(machine.current).toBe("authenticated");
		});

		test("authenticated -> not-authenticated (UNAUTHENTICATE OK)", () => {
			const machine = new ClientStateMachine();
			advance(machine, [
				"connecting",
				"authenticated",
				"not-authenticated",
			]);
			expect(machine.current).toBe("not-authenticated");
		});

		test("logout -> disconnected (drain complete)", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "authenticated", "logout"]);
			machine.transition("disconnected");
			expect(machine.current).toBe("disconnected");
		});

		describe("any -> logout (logout() called)", () => {
			const reachable: Array<readonly ClientState[]> = [
				["connecting"],
				["connecting", "not-authenticated"],
				["connecting", "authenticated"],
				["connecting", "authenticated", "selected"],
				["connecting", "authenticated", "not-authenticated"],
			];

			for (const path of reachable) {
				test(`from ${path[path.length - 1]}`, () => {
					const machine = new ClientStateMachine();
					advance(machine, path);
					const from = machine.current;
					machine.transition("logout");
					expect(machine.current).toBe("logout");
					expect(from).not.toBe("logout");
				});
			}
		});

		describe("any -> disconnected (socket close / fatal error / server BYE)", () => {
			const reachable: Array<readonly ClientState[]> = [
				["connecting"],
				["connecting", "not-authenticated"],
				["connecting", "authenticated"],
				["connecting", "authenticated", "selected"],
				["connecting", "authenticated", "logout"],
			];

			for (const path of reachable) {
				test(`from ${path[path.length - 1]}`, () => {
					const machine = new ClientStateMachine();
					advance(machine, path);
					machine.transition("disconnected");
					expect(machine.current).toBe("disconnected");
				});
			}
		});

		test("disconnected -> disconnected is an idempotent no-op (not an error)", () => {
			const machine = new ClientStateMachine();
			expect(machine.current).toBe("disconnected");
			expect(() => machine.transition("disconnected")).not.toThrow();
			expect(machine.current).toBe("disconnected");
		});

		test("disconnected -> disconnected does not notify onTransition subscribers", () => {
			// It's a genuine no-op (nothing changed), so it must not fire a
			// spurious stateChange with prev === next.
			const machine = new ClientStateMachine();
			const cb = vi.fn();
			machine.onTransition(cb);

			machine.transition("disconnected");

			expect(cb).not.toHaveBeenCalled();
		});
	});

	describe("illegal edges are rejected", () => {
		const cases: Array<{
			name: string;
			path: readonly ClientState[];
			to: ClientState;
		}> = [
			{ name: "disconnected -> authenticated", path: [], to: "authenticated" },
			{ name: "disconnected -> selected", path: [], to: "selected" },
			{
				name: "connecting -> selected",
				path: ["connecting"],
				to: "selected",
			},
			{
				name: "not-authenticated -> selected",
				path: ["connecting", "not-authenticated"],
				to: "selected",
			},
			{
				name: "authenticated -> connecting",
				path: ["connecting", "authenticated"],
				to: "connecting",
			},
			{
				name: "selected -> connecting",
				path: ["connecting", "authenticated", "selected"],
				to: "connecting",
			},
			{
				name: "logout -> authenticated",
				path: ["connecting", "authenticated", "logout"],
				to: "authenticated",
			},
			{
				name: "logout -> not-authenticated",
				path: ["connecting", "authenticated", "logout"],
				to: "not-authenticated",
			},
			// Extra coverage beyond the brief's minimum set:
			{
				name: "selected -> selected (reselect must pass through authenticated)",
				path: ["connecting", "authenticated", "selected"],
				to: "selected",
			},
			{
				name: "not-authenticated -> not-authenticated (same-state, non-disconnected)",
				path: ["connecting", "not-authenticated"],
				to: "not-authenticated",
			},
			{
				name: "logout -> logout (same-state, non-disconnected)",
				path: ["connecting", "authenticated", "logout"],
				to: "logout",
			},
		];

		test.each(cases)("$name", ({ path, to }) => {
			const machine = new ClientStateMachine();
			advance(machine, path);
			const from = machine.current;

			expect(() => machine.transition(to)).toThrow(
				IllegalStateTransitionError,
			);

			try {
				machine.transition(to);
			} catch (err) {
				expect(err).toBeInstanceOf(IllegalStateTransitionError);
				expect((err as IllegalStateTransitionError).from).toBe(from);
				expect((err as IllegalStateTransitionError).to).toBe(to);
			}

			// Rejected transitions must not mutate state.
			expect(machine.current).toBe(from);
		});
	});

	describe("onTransition ordering", () => {
		test("fires synchronously, with correct prev/next, before transition() returns", () => {
			const machine = new ClientStateMachine();
			const calls: Array<[ClientState, ClientState]> = [];
			machine.onTransition((state, prev) => {
				calls.push([prev, state]);
				// `current` is updated before subscribers are notified, so a
				// subscriber always observes the new state already in effect.
				expect(machine.current).toBe(state);
			});

			machine.transition("connecting");

			expect(calls).toEqual([["disconnected", "connecting"]]);
		});

		test("multiple subscribers all fire, in registration order", () => {
			const machine = new ClientStateMachine();
			const order: string[] = [];
			machine.onTransition(() => order.push("first"));
			machine.onTransition(() => order.push("second"));

			machine.transition("connecting");

			expect(order).toEqual(["first", "second"]);
		});

		test("does not fire for illegal transitions", () => {
			const machine = new ClientStateMachine();
			const cb = vi.fn();
			machine.onTransition(cb);

			expect(() => machine.transition("selected")).toThrow();

			expect(cb).not.toHaveBeenCalled();
		});

		test("unsubscribe stops further notifications", () => {
			const machine = new ClientStateMachine();
			const cb = vi.fn();
			const unsubscribe = machine.onTransition(cb);

			machine.transition("connecting");
			expect(cb).toHaveBeenCalledTimes(1);

			unsubscribe();
			machine.transition("authenticated");
			expect(cb).toHaveBeenCalledTimes(1);
		});
	});

	describe("assertIn()", () => {
		test("does not throw when current is in the allowed list", () => {
			const machine = new ClientStateMachine();
			expect(() =>
				machine.assertIn(["disconnected", "connecting"]),
			).not.toThrow();
		});

		test("throws IllegalStateError when current is not in the allowed list", () => {
			const machine = new ClientStateMachine();
			expect(() => machine.assertIn(["authenticated", "selected"])).toThrow(
				IllegalStateError,
			);
		});

		test("carries the current state and the required list on the error", () => {
			const machine = new ClientStateMachine();
			advance(machine, ["connecting", "authenticated"]);

			try {
				machine.assertIn(["selected"]);
				throw new Error("expected assertIn to throw");
			} catch (err) {
				expect(err).toBeInstanceOf(IllegalStateError);
				expect((err as IllegalStateError).state).toBe("authenticated");
				expect((err as IllegalStateError).required).toEqual(["selected"]);
			}
		});
	});
});
