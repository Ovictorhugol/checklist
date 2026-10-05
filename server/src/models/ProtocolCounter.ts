import { Schema, model } from 'mongoose'

export const ProtocolCounter = model('ProtocolCounter', new Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0 },
}, { versionKey: false }))
