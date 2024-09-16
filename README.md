# Tab Content Extractor

Tab Content Extractor is a browser extension for Chrome and Edge that allows users to extract and save content from multiple tabs in various formats.

## Features

- Extract content from selected tabs
- Save content in multiple formats: TXT, PDF, JSON, and HTML
- Copy content to clipboard
- Option to save content in separate files
- Option to extract only links without content

## Installation

1. Clone this repository or download the ZIP file.
2. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory containing the extension files.

## Usage

1. Click on the extension icon in your browser toolbar.
2. Select the tabs you want to extract content from.
3. Choose your desired output format (Copy, TXT, PDF, JSON, or HTML).
4. Optionally, check "Save in separate files" to create individual files for each tab.
5. Optionally, check "Links only" to extract only the URLs without content.
6. Click the corresponding button to perform the action.

## Project Structure

- `popup.html`: The main interface of the extension
- `styles.css`: Styles for the popup interface
- `popup.js`: Main logic for the extension's functionality
- `content.js`: Content script for extracting text from web pages
- `background.js`: Background script for handling tab queries
- `manifest.json`: Extension manifest file

## Contributing

Contributions are welcome! 

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

If you have any questions, feel free to open an issue or contact the maintainer.

## Acknowledgments

- [jsPDF](https://github.com/MrRio/jsPDF) - Used for PDF generation
