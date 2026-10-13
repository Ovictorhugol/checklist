export type SignaturePoint = { x: number; y: number }
export type SignatureInput = { signerName: string; strokes: SignaturePoint[][] }
export type SignatureRecord = SignatureInput & { signedAt: string; capturedBy: string; documentHash: string }
