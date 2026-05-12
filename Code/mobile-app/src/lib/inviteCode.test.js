import { generateInviteCode } from "./inviteCode";

describe("generateInviteCode", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a string of the requested length", () => {
    expect(generateInviteCode(8)).toHaveLength(8);
  });

  it("uses only characters from the invite alphabet", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    expect(generateInviteCode(3)).toBe("AAA");
  });
});
