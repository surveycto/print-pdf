/* global getPluginParameter, html2pdf */

// DOM elements
var errorContainer = document.querySelector('#error');
var resultContainer = document.querySelector('#result');
var loadingIndicator = document.querySelector('#loading');
var createButton = document.querySelector('#create');
var previewButton = document.querySelector('#preview');
var previewModal = document.querySelector('#preview-modal');
var previewContainer = document.querySelector('#preview-container');
var closeModalBtn = document.querySelector('.close-modal');
var closePreviewBtn = document.querySelector('#close-preview');
var downloadFromPreviewBtn = document.querySelector('#download-from-preview');

// Helper to parse margin values safely
function parseMargin(val, fallback) {
  var n = parseFloat(val);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
}

// Basic HTML sanitization - strips script tags and event handlers
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

// Get plugin parameters with defaults and validation
var rawContent = getPluginParameter('content');
var content = sanitizeHtml(rawContent);
var marginslr = parseMargin(getPluginParameter('marginslr'), 10); // Default 10mm left/right margin
var marginstb = parseMargin(getPluginParameter('marginstb'), 15); // Default 15mm top/bottom margin
var filename = getPluginParameter('filename') || 'document.pdf'; // Default filename
var paperSize = getPluginParameter('paperSize') || 'a4';
var orientation = getPluginParameter('orientation') || 'portrait';

// Add .pdf extension if not included in filename
if (!filename.toLowerCase().endsWith('.pdf')) {
    filename += '.pdf';
}

// Detect platform using SurveyCTO body classes (more reliable than UA sniffing)
var isAndroidCollect = document.body.className.indexOf('android-collect') >= 0;
var isIOSCollect = document.body.className.indexOf('ios-collect') >= 0;
var isWebCollect = document.body.className.indexOf('web-collect') >= 0;

// Native collect apps use WebView where PDF preview may not work reliably
var isWebView = isAndroidCollect || isIOSCollect;

// Helper to manage UI busy state consistently
function setBusy(isBusy) {
  loadingIndicator.style.display = isBusy ? 'block' : 'none';
  createButton.disabled = isBusy;
  previewButton.disabled = isBusy;
  downloadFromPreviewBtn.disabled = isBusy;
}

// Function to prepare content for PDF generation
function prepareContentForPDF(htmlContent) {
    // Create a wrapper div
    var wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    
    // Find the main container
    var mainContainer = wrapper.querySelector('div[style*="box-shadow"]') || wrapper.firstElementChild;
    
    if (mainContainer) {
        // Remove background from main container to prevent page spanning
        var currentStyle = mainContainer.getAttribute('style') || '';
        
        // Remove border, box-shadow, and background from main container
        currentStyle = currentStyle
            .replace(/border\s*:[^;]+;/gi, '')
            .replace(/box-shadow\s*:[^;]+;/gi, '')
            .replace(/background-color\s*:[^;]+;/gi, '');
            
        // Keep padding and margin
        if (!currentStyle.includes('padding')) {
            currentStyle += 'padding: 0;';
        }
        
        mainContainer.setAttribute('style', currentStyle);
        mainContainer.classList.add('pdf-content-container');
    }
    
    // Apply background to individual sections instead
    var sections = wrapper.querySelectorAll('section');
    sections.forEach(function(section, index) {
        // Add background and styling to each section individually
        section.style.backgroundColor = '#f9f9f9';
        section.style.border = '1px solid #ddd';
        section.style.padding = '20px';
        section.style.marginBottom = '25px';
        section.style.borderRadius = '4px';
        
        // Ensure sections don't break across pages
        section.style.pageBreakInside = 'avoid';
        section.style.breakInside = 'avoid';
        
        // Add spacing between sections
        if (index < sections.length - 1) {
            section.style.marginBottom = '30px';
        }
    });
    
    // Add CSS for page-specific styling (scoped under .pdf-content-container)
    var style = document.createElement('style');
    style.textContent = `
        @page {
            margin: ${marginstb}mm ${marginslr}mm;
            background-color: white;
        }
        
        .pdf-content-container {
            padding: 0;
            margin: 0;
        }
        
        .pdf-content-container section {
            background-color: #f9f9f9 !important;
            border: 1px solid #ddd !important;
            padding: 20px !important;
            margin-bottom: 25px !important;
            border-radius: 4px;
            page-break-inside: avoid;
            break-inside: avoid;
            display: block;
        }
        
        .pdf-content-container section:last-child {
            margin-bottom: 0 !important;
        }
        
        .pdf-content-container h4 {
            margin-top: 0;
            margin-bottom: 15px;
            page-break-after: avoid;
            break-after: avoid;
        }
        
        /* Ensure content within sections doesn't break awkwardly */
        .pdf-content-container section > div {
            page-break-inside: avoid;
            break-inside: avoid;
        }
    `;
    
    wrapper.insertBefore(style, wrapper.firstChild);
    
    return wrapper;
}

// PDF options
var opt = {
  margin: [marginstb, marginslr, marginstb, marginslr],
  filename: filename,
  jsPDF: {
    format: paperSize,
    orientation: orientation,
    unit: 'mm',
    compress: true
  },
  html2canvas: {
    scale: 2,
    useCORS: true,
    letterRendering: true
  },
  pagebreak: {
    mode: ['css', 'legacy'],
    avoid: ['tr', 'td', 'div[style*="margin-bottom"]']
  }
};

// Generate and download PDF
createButton.onclick = function() {
  generatePDF(true);
};

// Preview PDF
previewButton.onclick = function() {
  generatePDF(false);
};

// Close modal handlers
closeModalBtn.onclick = closePreview;
closePreviewBtn.onclick = closePreview;
downloadFromPreviewBtn.onclick = function() {
  errorContainer.textContent = '';
  resultContainer.textContent = '';
  setBusy(true);
  
  try {
    var preparedContent = prepareContentForPDF(content);
    html2pdf().set(opt).from(preparedContent).save()
      .then(function() {
        resultContainer.textContent = 'PDF downloaded successfully!';
        setBusy(false);
      })
      .catch(handleError);
  } catch (error) {
    handleError(error);
  }
};

// Close when clicking outside modal
window.onclick = function(event) {
  if (event.target === previewModal) {
    closePreview();
  }
};

// Function to generate PDF (download if isDownload=true, preview if false)
function generatePDF(isDownload) {
  // Clear previous messages
  errorContainer.textContent = '';
  resultContainer.textContent = '';
  
  // Check for valid content
  if (!content || !content.trim()) {
    errorContainer.textContent = 'No content available to generate a PDF.';
    return;
  }
  
  // Show loading indicator and disable buttons
  setBusy(true);
  
  try {
    // Prepare the content with proper styling and page breaks
    var preparedContent = prepareContentForPDF(content);
    
    if (isDownload) {
      // Generate and download PDF
      html2pdf().set(opt)
        .from(preparedContent)
        .save()
        .then(function() {
          var platform = '';
          if (isAndroidCollect) {
            platform = ' Check your Downloads folder or device storage.';
          } else if (isIOSCollect) {
            platform = ' Check the Files app on your device.';
          } else if (isWebCollect) {
            platform = ' Check your browser\'s download location.';
          }
          
          resultContainer.textContent = 'PDF downloaded successfully!' + platform;
          setBusy(false);
        })
        .catch(handleError);
    } else {
      // Clear previous preview
      previewContainer.innerHTML = '';
      
      // For WebView environments, show HTML preview instead of PDF
      if (isWebView) {
        showHTMLPreview(preparedContent);
      } else {
        // Generate PDF preview for regular browsers
        html2pdf().set(opt)
          .from(preparedContent)
          .outputPdf('datauristring')
          .then(function(pdfDataUri) {
            showPDFPreview(pdfDataUri);
          })
          .catch(function(error) {
            // Fallback to HTML preview if PDF preview fails
            console.warn('PDF preview failed, falling back to HTML:', error);
            showHTMLPreview(preparedContent);
          });
      }
    }
  } catch (error) {
    handleError(error);
  }
}

// Function to show HTML preview (WebView-friendly)
function showHTMLPreview(preparedContent) {
  var previewDiv = document.createElement('div');
  previewDiv.className = 'html-preview';
  previewDiv.style.cssText = `
    width: 100%;
    max-height: 500px;
    overflow-y: auto;
    border: 1px solid #ddd;
    padding: 20px;
    background-color: white;
    font-family: Arial, sans-serif;
  `;
  
  // Clone the content and apply preview-specific styles
  var contentClone = preparedContent.cloneNode(true);
  
  // Add a header to indicate this is HTML preview
  var header = document.createElement('div');
  header.style.cssText = `
    background-color: #f0f0f0;
    padding: 10px;
    margin-bottom: 15px;
    border-radius: 4px;
    font-size: 14px;
    color: #666;
    text-align: center;
  `;
  header.textContent = 'HTML Preview (PDF will be formatted differently)';
  
  previewDiv.appendChild(header);
  previewDiv.appendChild(contentClone);
  previewContainer.appendChild(previewDiv);
  
  previewModal.style.display = 'block';
  
  setBusy(false);
}

// Function to show PDF preview (regular browsers)
function showPDFPreview(pdfDataUri) {
  var iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '500px';
  iframe.style.border = 'none';
  iframe.src = pdfDataUri;
  
  previewContainer.appendChild(iframe);
  previewModal.style.display = 'block';
  
  setBusy(false);
}

// Function to close preview modal
function closePreview() {
  previewModal.style.display = 'none';
}

// Error handler function
function handleError(error) {
  var message = (error && error.message) ? error.message : String(error || 'Unknown error');
  errorContainer.textContent = 'Error: ' + message;
  setBusy(false);
}
