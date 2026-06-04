export function generateUuid(): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(Math.floor(Math.random() * 16).toString(16));
  }
  return hex.join('');
}
