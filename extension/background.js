// Course Assistant Extension - Background Script

const BACKEND_URL = 'http://localhost:8000';

// Extension state
let syncInProgress = false;
let courseData = {};

// Install listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('Course Assistant installed');
  
  // Set up context menu
  chrome.contextMenus.create({
    id: 'sync-course',
    title: 'Sync this course',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://onq.queensu.ca/*',
      'https://canvas.instructure.com/*'
    ]
  });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'Extension is active' });
      break;
      
    case 'sync-course':
      handleCourseSync(request.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open for async response
      
    case 'sync-file':
      handleFileSync(request.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'get-sync-status':
      sendResponse({
        success: true,
        syncInProgress,
        courseCount: Object.keys(courseData).length
      });
      break;
      
    case 'get-courses':
      sendResponse({
        success: true,
        courses: Object.values(courseData)
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sync-course') {
    // Send message to content script to extract course data
    chrome.tabs.sendMessage(tab.id, { action: 'extract-course-data' });
  }
});

// Handle course synchronization
async function handleCourseSync(data) {
  try {
    syncInProgress = true;
    
    console.log('Syncing course:', data);
    
    // Send course data to backend
    const response = await fetch(`${BACKEND_URL}/api/sync/course`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Store course data locally
    courseData[data.code] = {
      ...data,
      id: result.course_id,
      lastSync: new Date().toISOString()
    };
    
    // Save to storage
    await chrome.storage.local.set({ courseData });
    
    // Update badge
    chrome.action.setBadgeText({ text: Object.keys(courseData).length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    
    syncInProgress = false;
    
    return {
      success: true,
      message: `Course "${data.name}" synced successfully`,
      courseId: result.course_id
    };
    
  } catch (error) {
    syncInProgress = false;
    console.error('Course sync error:', error);
    throw error;
  }
}

// Handle file synchronization
async function handleFileSync(data) {
  try {
    console.log('Syncing file:', data);
    
    // Download file first if URL provided
    let filePath = data.path;
    if (data.downloadUrl) {
      filePath = await downloadFile(data.downloadUrl, data.filename);
    }
    
    // Notify backend that file is ready
    const response = await fetch(`${BACKEND_URL}/api/sync/file-ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        path: filePath
      })
    });
    
    if (!response.ok) {
      throw new Error(`File sync failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    return {
      success: true,
      message: `File "${data.filename}" queued for processing`
    };
    
  } catch (error) {
    console.error('File sync error:', error);
    throw error;
  }
}

// Download file helper
async function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: `course-assistant-temp/${filename}`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Listen for download completion
      const listener = (delta) => {
        if (delta.id === downloadId && delta.state?.current === 'complete') {
          chrome.downloads.onChanged.removeListener(listener);
          
          // Get download info
          chrome.downloads.search({ id: downloadId }, (downloads) => {
            if (downloads.length > 0) {
              resolve(downloads[0].filename);
            } else {
              reject(new Error('Download not found'));
            }
          });
        } else if (delta.id === downloadId && delta.state?.current === 'interrupted') {
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error('Download interrupted'));
        }
      };
      
      chrome.downloads.onChanged.addListener(listener);
    });
  });
}

// Load saved course data on startup
chrome.storage.local.get(['courseData']).then((result) => {
  if (result.courseData) {
    courseData = result.courseData;
    chrome.action.setBadgeText({ text: Object.keys(courseData).length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  }
});

// Handle tab updates to inject bridge script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const supportedSites = [
      'onq.queensu.ca',
      'canvas.instructure.com',
      'learn.uwaterloo.ca',
      'eclass.yorku.ca'
    ];
    
    if (supportedSites.some(site => tab.url.includes(site))) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['bridge.js']
      }).catch(console.error);
    }
  }
}); 