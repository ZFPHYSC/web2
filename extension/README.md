# Course Assistant Chrome Extension

This Chrome extension automatically syncs course content from your Learning Management System (LMS) to the Course Assistant application.

## Supported LMS Platforms

- **Brightspace (D2L)** - e.g., OnQ at Queen's University
- **Canvas** - Instructure Canvas
- **Moodle** - Including eClass variants  
- **Learn** - University of Waterloo Learn

## Installation Instructions

1. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/` in your Chrome browser

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

3. **Load the Extension**
   - Click the "Load unpacked" button
   - Select the `extension` folder from your course-assistant project directory

4. **Pin the Extension**
   - Click the puzzle piece icon in Chrome's toolbar
   - Find "Course Assistant" and click the pin icon to keep it visible

## How to Use

### Method 1: Using the Extension Popup
1. Navigate to any course page on your LMS
2. Click the Course Assistant extension icon in your toolbar
3. Click "Sync Current Course" in the popup

### Method 2: Using the On-Page Button
1. Navigate to any course page on your LMS
2. Look for the "🤖 Sync with Course Assistant" button that appears on the page
3. Click the button to sync the current course

### Method 3: Using the Context Menu
1. Right-click on any course page
2. Select "Sync this course" from the context menu

## What Gets Synced

The extension automatically extracts:
- Course name and code
- Course description
- Module/section information
- Document links (PDFs, DOCX, PPTX, etc.)
- File metadata

## Troubleshooting

### Extension Not Working
- Make sure you're on a supported LMS course page
- Check that the extension is enabled in `chrome://extensions/`
- Try refreshing the page and clicking sync again

### Sync Button Not Appearing
- Verify you're on a course content page (not the main LMS homepage)
- The button appears automatically on supported course pages
- Try refreshing the page

### Sync Fails
- Check that the Course Assistant backend is running on `http://localhost:8000`
- Verify your internet connection
- Check the browser console for error messages

## Development

The extension consists of:
- `manifest.json` - Extension configuration
- `background.js` - Background service worker
- `content.js` - Content script for LMS page interaction
- `popup.html/js` - Extension popup interface

## Privacy

This extension only:
- Accesses course pages you visit
- Extracts publicly available course information
- Sends data to your local Course Assistant application
- Does not collect personal information or send data to external servers 