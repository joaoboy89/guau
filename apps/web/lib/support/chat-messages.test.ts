import { getEmptyChatMessage } from "./chat-messages";

describe("getEmptyChatMessage", () => {
  it("conversationExists true: dice que la conversacion existe y nadie escribio", () => {
    expect(getEmptyChatMessage(true)).toBe(
      "La conversación existe, pero ninguna de las partes escribió.",
    );
  });

  it("conversationExists false: dice que el paseo nunca llego a tener conversacion, y por que", () => {
    const text = getEmptyChatMessage(false);
    expect(text).toContain("no llegó a tener conversación");
    expect(text).toContain("nunca se confirmó");
  });

  it("los dos textos son distintos entre si — el punto entero del fix", () => {
    expect(getEmptyChatMessage(true)).not.toBe(getEmptyChatMessage(false));
  });
});
