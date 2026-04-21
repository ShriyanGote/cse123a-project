const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    code += ALPHABET[idx];
  }
  return code;
}
