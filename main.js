
// Main script for YouTube video popup.

/**
 * Maximum character count allowed for the input text.
 * This limit is based on the underlying model's token limit.
 * @constant {number}
 */
const MAX_MODEL_CHARS = 4000;

// Element references
const inputTextArea = document.querySelector('#input');
const summaryTypeSelect = document.querySelector('#type');
const summaryFormatSelect = document.querySelector('#format');
const summaryLengthSelect = document.querySelector('#length');
const characterCountSpan = document.querySelector('#character-count');
const characterCountExceededSpan = document.querySelector('#character-count-exceed');
const summarizationUnsupportedDialog = document.querySelector('#summarization-unsupported');
const summarizationUnavailableDialog = document.querySelector('#summarization-unavailable');
const output = document.querySelector('#output');

/**
 * Creates a summarization session. Downloads the model if necessary.
 *
 * @param {string} type - Type of summarization (e.g., 'short', 'detailed').
 * @param {string} format - Format for the summary (e.g., 'text', 'bullets').
 * @param {string} length - Desired length of the summary (e.g., 'short', 'long').
 * @param {Function} [downloadProgressCallback] - Optional callback for tracking download progress.
 * @returns {Promise<Object>} Resolves to the summarization session object.
 * @throws {Error} If AI summarization is not supported.
 */
const createSummarizationSession = async (type, format, length, downloadProgressCallback) => {
    const canSummarize = await window.ai.summarizer.capabilities();
    if (canSummarize.available === 'no') {
        throw new Error('AI Summarization is not supported');
    }

    const summarizationSession = await window.ai.summarizer.create({ type, format, length });
    if (canSummarize.available === 'after-download') {
        if (downloadProgressCallback) {
            summarizationSession.addEventListener('downloadprogress', downloadProgressCallback);
        }
        await summarizationSession.ready;
    }

    return summarizationSession;
}

/**
 * Initializes the application.
 * Checks the availability of the Summarization API, and sets up event listeners
 * for summarizing the text added to the input textarea.
 * If the API is unavailable or unsupported, it displays relevant dialogs.
 */
const initializeApplication = async () => {
    const summarizationApiAvailable = window.ai !== undefined && window.ai.summarizer !== undefined;
    if (!summarizationApiAvailable) {
        summarizationUnavailableDialog.showModal();
        return;
    }

    const canSummarize = await window.ai.summarizer.capabilities();
    if (canSummarize.available === 'no') {
        summarizationUnsupportedDialog.showModal();
        return;
    }

    let timeout;

    /**
     * Schedules the summarization process with a debounce delay.
     * Waits for the user to stop typing for 1 second before generating a summary.
     */
    function scheduleSummarization() {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            output.textContent = 'Generating summary...';
            const session = await createSummarizationSession(
                summaryTypeSelect.value,
                summaryFormatSelect.value,
                summaryLengthSelect.value,
            );

            const summary = await session.summarize(inputTextArea.value);

            session.destroy();
            output.textContent = summary;
        }, 1000);
    }

    // Event listeners for UI controls
    summaryTypeSelect.addEventListener('change', scheduleSummarization);
    summaryFormatSelect.addEventListener('change', scheduleSummarization);
    summaryLengthSelect.addEventListener('change', scheduleSummarization);

    inputTextArea.addEventListener('input', () => {
        // Update character count display
        characterCountSpan.textContent = inputTextArea.value.length;
        if (inputTextArea.value.length > MAX_MODEL_CHARS) {
            characterCountSpan.classList.add('tokens-exceeded');
            characterCountExceededSpan.classList.remove('hidden');
        } else {
            characterCountSpan.classList.remove('tokens-exceeded');
            characterCountExceededSpan.classList.add('hidden');
        }
        scheduleSummarization();
    });
}

// Start the application
console.log(`Initializing the application.`);

initializeApplication();
