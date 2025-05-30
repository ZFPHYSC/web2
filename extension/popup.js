// Course Assistant Extension - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status')
  const courseCountDiv = document.getElementById('courseCount')
  const syncButton = document.getElementById('syncButton')
  const openDashboardButton = document.getElementById('openDashboard')

  // Load current status
  await loadStatus()

  // Event listeners
  syncButton.addEventListener('click', handleSync)
  openDashboardButton.addEventListener('click', openDashboard)

  async function loadStatus() {
    try {
      // Get sync status from background script
      const response = await chrome.runtime.sendMessage({ action: 'get-sync-status' })
      
      if (response.success) {
        if (response.syncInProgress) {
          statusDiv.textContent = 'Syncing in progress...'
          statusDiv.className = 'status syncing'
          syncButton.disabled = true
        } else {
          statusDiv.textContent = 'Ready to sync courses'
          statusDiv.className = 'status ready'
          syncButton.disabled = false
        }
        
        const courseCount = response.courseCount || 0
        courseCountDiv.textContent = courseCount === 0 
          ? 'No courses synced yet' 
          : `${courseCount} course${courseCount === 1 ? '' : 's'} synced`
      }
    } catch (error) {
      console.error('Error loading status:', error)
      statusDiv.textContent = 'Error loading status'
      statusDiv.className = 'status'
    }
  }

  async function handleSync() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!tab) {
        alert('No active tab found')
        return
      }

      // Check if we're on a supported LMS site
      const supportedSites = [
        'onq.queensu.ca',
        'canvas.instructure.com',
        'learn.uwaterloo.ca',
        'eclass.yorku.ca'
      ]

      const isSupported = supportedSites.some(site => tab.url.includes(site))
      
      if (!isSupported) {
        alert('Please navigate to a supported LMS course page first.\n\nSupported sites:\n• OnQ (Queen\'s University)\n• Canvas\n• Learn (University of Waterloo)\n• eClass (York University)')
        return
      }

      // Update UI
      statusDiv.textContent = 'Starting sync...'
      statusDiv.className = 'status syncing'
      syncButton.disabled = true

      // Send message to content script to extract course data
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract-course-data' })
      
      if (response && response.success) {
        statusDiv.textContent = 'Course synced successfully!'
        statusDiv.className = 'status ready'
        
        // Reload status after a delay
        setTimeout(loadStatus, 2000)
      } else {
        throw new Error(response?.error || 'Failed to sync course')
      }
      
    } catch (error) {
      console.error('Sync error:', error)
      statusDiv.textContent = 'Sync failed: ' + error.message
      statusDiv.className = 'status'
      syncButton.disabled = false
    }
  }

  function openDashboard() {
    chrome.tabs.create({ url: 'http://localhost:3000' })
  }
}) 