// Course Assistant Extension - Content Script

// LMS Detection and Data Extraction
class LMSExtractor {
  constructor() {
    this.currentLMS = this.detectLMS();
    this.courseData = null;
    this.init();
  }

  detectLMS() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('onq.queensu.ca')) return 'brightspace';
    if (hostname.includes('canvas.instructure.com')) return 'canvas';
    if (hostname.includes('learn.uwaterloo.ca')) return 'learn';
    if (hostname.includes('eclass.yorku.ca')) return 'moodle';
    
    return 'unknown';
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extract-course-data') {
        this.extractCourseData()
          .then(data => {
            sendResponse({ success: true, data });
            // Automatically sync the course
            chrome.runtime.sendMessage({
              action: 'sync-course',
              data
            });
          })
          .catch(error => {
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }
    });

    // Add sync button to course pages
    this.addSyncButton();
    
    // Auto-detect course changes
    this.observePageChanges();
  }

  async extractCourseData() {
    switch (this.currentLMS) {
      case 'brightspace':
        return this.extractBrightspaceData();
      case 'canvas':
        return this.extractCanvasData();
      case 'learn':
        return this.extractLearnData();
      case 'moodle':
        return this.extractMoodleData();
      default:
        throw new Error('Unsupported LMS');
    }
  }

  extractBrightspaceData() {
    // Extract Brightspace (OnQ) course data
    const courseNameElement = document.querySelector('.d2l-page-title, .d2l-navigation-s-main-title');
    const courseCodeElement = document.querySelector('.d2l-course-selector-item-text-truncate');
    
    if (!courseNameElement) {
      throw new Error('Could not find course information on this page');
    }

    const courseName = courseNameElement.textContent.trim();
    const courseCode = courseCodeElement ? 
      courseCodeElement.textContent.trim().split(' ')[0] : 
      courseName.split(' ')[0];

    // Extract modules/content
    const modules = this.extractBrightspaceModules();

    return {
      id: this.generateCourseId(courseCode),
      name: courseName,
      code: courseCode,
      description: '',
      modules: modules,
      lms: 'brightspace',
      url: window.location.href
    };
  }

  extractCanvasData() {
    // Extract Canvas course data
    const courseNameElement = document.querySelector('.ic-app-course-menu__course-title, .ellipsis');
    const courseCodeElement = document.querySelector('.course-title .subtitle');
    
    if (!courseNameElement) {
      throw new Error('Could not find course information on this page');
    }

    const courseName = courseNameElement.textContent.trim();
    const courseCode = courseCodeElement ? 
      courseCodeElement.textContent.trim() : 
      courseName.split(' ')[0];

    // Extract modules/content
    const modules = this.extractCanvasModules();

    return {
      id: this.generateCourseId(courseCode),
      name: courseName,
      code: courseCode,
      description: '',
      modules: modules,
      lms: 'canvas',
      url: window.location.href
    };
  }

  extractLearnData() {
    // Extract Learn (Waterloo) course data
    const courseNameElement = document.querySelector('.course-title, .d_ich');
    
    if (!courseNameElement) {
      throw new Error('Could not find course information on this page');
    }

    const courseName = courseNameElement.textContent.trim();
    const courseCode = courseName.split(' ')[0];

    return {
      id: this.generateCourseId(courseCode),
      name: courseName,
      code: courseCode,
      description: '',
      modules: [],
      lms: 'learn',
      url: window.location.href
    };
  }

  extractMoodleData() {
    // Extract Moodle course data
    const courseNameElement = document.querySelector('.page-header-headings h1, .course-title');
    
    if (!courseNameElement) {
      throw new Error('Could not find course information on this page');
    }

    const courseName = courseNameElement.textContent.trim();
    const courseCode = courseName.split(' ')[0];

    return {
      id: this.generateCourseId(courseCode),
      name: courseName,
      code: courseCode,
      description: '',
      modules: [],
      lms: 'moodle',
      url: window.location.href
    };
  }

  extractBrightspaceModules() {
    const modules = [];
    const moduleElements = document.querySelectorAll('.d2l-le-TreeAccordionLeaf, .d2l-content-topic');

    moduleElements.forEach((element, index) => {
      const titleElement = element.querySelector('.d2l-textblock, .d2l-link');
      if (titleElement) {
        modules.push({
          id: `module_${index}`,
          title: titleElement.textContent.trim(),
          files: this.extractModuleFiles(element)
        });
      }
    });

    return modules;
  }

  extractCanvasModules() {
    const modules = [];
    const moduleElements = document.querySelectorAll('.context_module, .ig-list .ig-row');

    moduleElements.forEach((element, index) => {
      const titleElement = element.querySelector('.ig-title, .item_name');
      if (titleElement) {
        modules.push({
          id: `module_${index}`,
          title: titleElement.textContent.trim(),
          files: this.extractModuleFiles(element)
        });
      }
    });

    return modules;
  }

  extractModuleFiles(moduleElement) {
    const files = [];
    const fileLinks = moduleElement.querySelectorAll('a[href*=".pdf"], a[href*=".docx"], a[href*=".pptx"]');

    fileLinks.forEach(link => {
      const filename = link.textContent.trim();
      const downloadUrl = link.href;
      
      if (filename && downloadUrl) {
        files.push({
          filename,
          downloadUrl,
          type: this.getFileType(filename)
        });
      }
    });

    return files;
  }

  getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'pdf': 'document',
      'docx': 'document',
      'pptx': 'presentation',
      'xlsx': 'spreadsheet',
      'txt': 'text'
    };
    return typeMap[extension] || 'unknown';
  }

  generateCourseId(courseCode) {
    return courseCode.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }

  addSyncButton() {
    // Only add if we're on a course page
    if (!this.isCoursePage()) return;

    const button = document.createElement('button');
    button.innerHTML = '🤖 Sync with Course Assistant';
    button.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: #10b981;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transition: all 0.2s;
    `;

    button.addEventListener('click', () => {
      button.innerHTML = '🔄 Syncing...';
      button.disabled = true;
      
      this.extractCourseData()
        .then(data => {
          chrome.runtime.sendMessage({
            action: 'sync-course',
            data
          }, response => {
            if (response.success) {
              button.innerHTML = '✅ Synced!';
              setTimeout(() => {
                button.innerHTML = '🤖 Sync with Course Assistant';
                button.disabled = false;
              }, 2000);
            } else {
              button.innerHTML = '❌ Error';
              console.error('Sync failed:', response.error);
            }
          });
        })
        .catch(error => {
          button.innerHTML = '❌ Error';
          console.error('Extract failed:', error);
        });
    });

    document.body.appendChild(button);
  }

  isCoursePage() {
    // Check if we're on a course page based on URL patterns
    const url = window.location.href;
    
    // Common course page patterns
    const coursePatterns = [
      /\/course\/\d+/,           // Canvas: /courses/123456
      /\/d2l\/le\/content/,      // Brightspace: /d2l/le/content/
      /\/learn\/course/,         // Learn: /learn/course/
      /\/course\/view/,          // Moodle: /course/view.php?id=
    ];
    
    return coursePatterns.some(pattern => pattern.test(url));
  }

  observePageChanges() {
    // Monitor for page changes (SPA navigation)
    let lastUrl = window.location.href;
    
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(() => this.addSyncButton(), 1000);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize the extractor
new LMSExtractor(); 