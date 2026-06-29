export interface TTSProvider {
  /**
   * Generates an audio stream from the given text.
   * @param text The text snippet to convert to speech.
   * @returns A Promise resolving to a ReadableStream of audio data.
   */
  generateAudioStream(text: string): Promise<ReadableStream<Uint8Array>>;
}
