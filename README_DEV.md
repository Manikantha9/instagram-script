# Desktop Build Instructions

You can turn this web app into a standalone Windows `.exe` file.

### Prerequisites
1. Install [Node.js](https://nodejs.org/).
2. Download the source code of this app (Settings > Export to ZIP).

### Steps to Build the EXE

1. **Install dependencies**:
   Open a terminal in the project folder and run:
   ```bash
   npm install
   ```

2. **Run in Desktop Mode (Preview)**:
   To test the app locally as a window:
   ```bash
   npm run desktop
   ```

3. **Build the Windows EXE**:
   To generate the installer/portable executable:
   ```bash
   npm run build:exe
   ```
   The `.exe` will be created in the `release/` folder.

### Retry Mechanism
The app is now configured with a **2-layer retry system**:
1. **Scrapper Retry**: The backend attempts to fetch the video URL 2 times before giving up.
2. **Pipeline Retry**: If transcription fails for any reason, the UI will wait 2 seconds and retry exactly once before skipping to the next Reel. Logs will show `[retry]` and `[skip]` statuses.
