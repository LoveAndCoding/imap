import NewlineTranform from "../../src/newline.transform";
import { vi } from "vitest";

describe("NewlineTranform", () => {
	test("Breaks incoming full lines into newlines", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = ["test\r\n", "test2\r\n", "test3\r\n"];

		//Act
		write.forEach((line) => autobot.write(line, "utf8"));

		//Assert
		expect(listenerMock).toBeCalledTimes(3);
		expect(listenerMock).toBeCalledWith(Buffer.from(write[0]));
		expect(autobot.read().toString()).toBe(write[0]);
		expect(listenerMock).toBeCalledWith(Buffer.from(write[1]));
		expect(autobot.read().toString()).toBe(write[1]);
		expect(listenerMock).toBeCalledWith(Buffer.from(write[2]));
		expect(autobot.read().toString()).toBe(write[2]);
	});

	test("Respects empty lines", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = [
			"test\r\n\r\n",
			"\r\n",
			"test2\r\n",
			"\r\n",
			"test3\r\n",
			"\r\n",
			"\r\n",
		];

		//Act
		write.forEach((line) => autobot.write(line, "utf8"));

		//Assert
		expect(listenerMock).toBeCalledTimes(8);
		expect(listenerMock).toHaveBeenNthCalledWith(
			1,
			Buffer.from("test\r\n"),
		);
		expect(listenerMock).toHaveBeenNthCalledWith(2, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(3, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(
			4,
			Buffer.from("test2\r\n"),
		);
		expect(listenerMock).toHaveBeenNthCalledWith(5, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(
			6,
			Buffer.from("test3\r\n"),
		);
		expect(listenerMock).toHaveBeenNthCalledWith(7, Buffer.from("\r\n"));
		expect(listenerMock).toHaveBeenNthCalledWith(8, Buffer.from("\r\n"));
		expect(autobot.read().toString()).toBe("test\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("test2\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("test3\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
		expect(autobot.read().toString()).toBe("\r\n");
	});

	test("Breaks oddly split lines into newlines", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = ["te", "st\r", "\n", "test2\r\ntest3", "\r\n"];

		//Act
		write.forEach((line) => autobot.write(line, "utf8"));

		//Assert
		expect(listenerMock).toBeCalledTimes(3);
		expect(listenerMock).toBeCalledWith(Buffer.from("test\r\n"));
		expect(autobot.read().toString()).toBe("test\r\n");
		expect(listenerMock).toBeCalledWith(Buffer.from("test2\r\n"));
		expect(autobot.read().toString()).toBe("test2\r\n");
		expect(listenerMock).toBeCalledWith(Buffer.from("test3\r\n"));
		expect(autobot.read().toString()).toBe("test3\r\n");
	});

	test("Accepts string and buffer writes", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = ["test", Buffer.from("\r\n")];

		//Act
		write.forEach((line) => autobot.write(line));

		//Assert
		expect(listenerMock).toBeCalledTimes(1);
		expect(listenerMock).toBeCalledWith(Buffer.from("test\r\n"));
		expect(autobot.read().toString()).toBe("test\r\n");
	});

	test("Does not accept object writes", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		const errListenerMock = vi.fn();
		autobot.on("line", listenerMock);
		autobot.on("error", errListenerMock);
		const writeObj = {
			toString() {
				return "test\r\n";
			},
		};

		//Act
		return new Promise<void>((resolve, reject) => {
			autobot.write(writeObj, (err) => {
				try {
					//Assert
					expect(listenerMock).toBeCalledTimes(0);
					expect(err).toBeInstanceOf(TypeError);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});

	test("Respects max buffer length", () => {
		//Arrange
		const autobot = new NewlineTranform({ maxLineLength: 2 });
		const listenerMock = vi.fn();
		const errListenerMock = vi.fn();
		autobot.on("line", listenerMock);
		autobot.on("error", errListenerMock);
		const write = "A test string but it's too long\r\n";

		//Act
		return new Promise<void>((resolve, reject) => {
			autobot.write(write, (err) => {
				try {
					//Assert
					expect(listenerMock).toBeCalledTimes(0);
					expect(err).toBeInstanceOf(RangeError);
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});

	test("Flushes any unfinished data to lines on end", () => {
		//Arrange
		const autobot = new NewlineTranform();
		const listenerMock = vi.fn();
		autobot.on("line", listenerMock);
		const write = "Roll out";

		//Act
		autobot.write(write);
		expect(listenerMock).toBeCalledTimes(0);
		return new Promise<void>((resolve, reject) => {
			autobot.end((err) => {
				try {
					//Assert
					expect(listenerMock).toBeCalledTimes(1);
					expect(listenerMock).toBeCalledWith(Buffer.from(write));
					expect(err).toBeFalsy();
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});
});
