# Google Sheets to WhatsApp Notifier

This Node.js application monitors a specified Google Sheet for new entries and sends automated confirmation messages via WhatsApp to the contact numbers listed in the sheet. It's designed to run continuously, checking for new rows every 60 seconds and marking them as "Notification Sent" after processing.

## Features

*   Reads new rows from a Google Sheet.
*   Sends customizable WhatsApp confirmation messages.
*   Automatically marks processed rows in the Google Sheet.
*   Runs on a 60-second polling interval.
*   Supports persistent WhatsApp session login via QR code.
*   Includes Docker support for easy deployment.

## Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js**: Version 14 or higher. You can download it from [nodejs.org](https://nodejs.org/).
*   **npm** (Node Package Manager): Comes bundled with Node.js.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/sheets-whatsapp.git
    cd sheets-whatsapp
    ```
    (Note: Replace `https://github.com/your-repo/sheets-whatsapp.git` with the actual repository URL if this project is hosted on GitHub.)

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

### 1. Google Sheets API Access

This application requires access to your Google Sheet. Follow these steps to set up API credentials:

1.  **Go to Google Cloud Console:** Visit [console.cloud.google.com](https://console.cloud.google.com/).
2.  **Create a new project:** If you don't have one, create a new project.
3.  **Enable Google Sheets API:**
    *   In the search bar, type "Google Sheets API" and select it.
    *   Click "Enable".
4.  **Create Credentials:**
    *   Navigate to "APIs & Services" > "Credentials".
    *   Click "Create Credentials" > "OAuth client ID".
    *   For "Application type", select "Desktop app".
    *   Give it a name (e.g., "WhatsApp Notifier").
    *   Click "Create".
5.  **Download `credentials.json`:**
    *   After creating, you'll see your client ID and client secret. Click the "Download JSON" button.
    *   Rename the downloaded file to `credentials.json` and place it in the root directory of this project (where `ical_daily_send.js` is located).

6.  **Update `GOOGLE_SHEET_ID`:**
    *   Open `ical_daily_send.js`.
    *   Locate the line `const GOOGLE_SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";`
    *   Replace `"YOUR_GOOGLE_SHEET_ID_HERE"` with the actual ID of your Google Sheet. The Sheet ID is found in the URL of your Google Sheet (e.g., `https://docs.google.com/spreadsheets/d/YOUR_GOOGLE_SHEET_ID_HERE/edit`).

7.  **Add "Notification Sent" Column:**
    *   Open your Google Sheet.
    *   Add a new column, preferably at the end, named exactly `Notification Sent`. This column will be used by the script to track which rows have already triggered a WhatsApp notification. New rows should have this column blank or set to `FALSE`. The script will automatically set it to `TRUE` after sending a message.

### 2. WhatsApp Web Login

The first time you run the script, it will generate a QR code in your terminal. You'll need to scan this QR code using your WhatsApp mobile app to link the session.

1.  Open WhatsApp on your phone.
2.  Go to `Settings` (or `Linked Devices` on iOS) > `Linked Devices` > `Link a Device`.
3.  Scan the QR code displayed in your terminal.

Once authenticated, `whatsapp-web.js` will save a session file (`wwebjs_auth` folder) to persist your login, so you won't need to scan the QR code again unless the session expires or is revoked.

## Running the Application

To start the application, run the following command in your terminal from the project root:

```bash
node ical_daily_send.js
```

The script will then start monitoring your Google Sheet and sending messages.

## Running with Docker

You can containerize this application using Docker for easier deployment.

1.  **Build the Docker image:**
    ```bash
    docker build -t sheets-whatsapp-notifier .
    ```

2.  **Run the Docker container:**
    *   **Important:** You need to mount the `credentials.json` and `wwebjs_auth` (for WhatsApp session) into the container.
    *   For `credentials.json`, ensure it's in your project root.
    *   For `wwebjs_auth`, this folder will be created after the first successful WhatsApp login.

    ```bash
    docker run -it \
      -v $(pwd)/credentials.json:/app/credentials.json \
      -v $(pwd)/wwebjs_auth:/app/wwebjs_auth \
      sheets-whatsapp-notifier
    ```
    *   The `-it` flags are important for interactive mode, allowing you to see the QR code for WhatsApp login and paste the Google authorization code.
    *   The `-v` flags mount your local `credentials.json` file and `wwebjs_auth` directory into the container, ensuring persistence of credentials and WhatsApp session.

    **Note on first run with Docker:** The first time you run the Docker container, you will need to interact with it to authorize Google Sheets API and scan the WhatsApp QR code. Keep the terminal window open until both are complete.
