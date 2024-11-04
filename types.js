/**
 * @typedef {'readily' | 'after-download' | 'no'} AIModelAvailability
 */

/**
 * @typedef {'tl;dr' | 'key-points' | 'teaser' | 'headline'} AISummarizerType
 */

/**
 * @typedef {'plain-text' | 'markdown'} AISummarizerFormat
 */

/**
 * @typedef {'short' | 'medium' | 'long'} AISummarizerLength
 */

/**
 * @typedef {Object} AISummarizerCreateOptions
 * @property {AISummarizerType} [type] - Type of summary to generate.
 * @property {AISummarizerLength} [length] - Desired length of the summary.
 * @property {AISummarizerFormat} [format] - Format of the summary output.
 */

/**
 * @typedef {Object} AISummarizerCapabilities
 * @property {AIModelAvailability} available - The model's availability status.
 */

/**
 * @typedef {Object} AIModelDownloadProgressEvent
 * @property {number} loaded - The number of bytes downloaded so far.
 * @property {number} total - The total number of bytes to be downloaded.
 */

/**
 * @callback AIModelDownloadCallback
 * @param {string} modelId - The ID of the model being downloaded.
 * @param {AIModelDownloadProgressEvent} progressEvent - Progress details for the download.
 */

/**
 * @typedef {Object} AISummarizerSession
 * @property {() => void} destroy - Ends the summarization session.
 * @property {Promise<void>} ready - Resolves when the session is ready for summarization.
 * @property {(text: string) => Promise<string>} summarize - Generates a summary for the provided text.
 * @property {AIModelDownloadCallback} addEventListener - Adds an event listener for download progress events.
 */

/**
 * @typedef {Object} AISummarizer
 * @property {() => Promise<AISummarizerCapabilities>} capabilities - Fetches model capabilities.
 * @property {(options?: AISummarizerCreateOptions) => Promise<AISummarizerSession>} create - Creates a summarization session.
 */
