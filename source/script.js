/* global getPluginParameter, html2pdf */

// Helper to safely get DOM elements with error handling
function requireElement(selector) {
  var el = document.querySelector(selector);
  if (!el) {
    console.error('Print PDF Plugin: Missing required element: ' + selector);
    return null;
  }
  return el;
}

// DOM elements with defensive checks
var errorContainer = requireElement('#error');
var resultContainer = requireElement('#result');
var loadingIndicator = requireElement('#loading');
var createButton = requireElement('#create');
var previewButton = requireElement('#preview');
var previewModal = requireElement('#preview-modal');
var previewContainer = requireElement('#preview-container');
var closeModalBtn = requireElement('.close-modal');
var closePreviewBtn = requireElement('#close-preview');
var downloadFromPreviewBtn = requireElement('#download-from-preview');

// Track current preview blob URL for cleanup
var currentPreviewUrl = null;

// Helper to parse margin values safely
function parseMargin(val, fallback) {
  var n = parseFloat(val);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
}

// DOM-based HTML sanitization - more robust than regex
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  var template = document.createElement('template');
  template.innerHTML = html;

  var dangerousTags = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base'];
  
  // Remove dangerous elements
  dangerousTags.forEach(function(tag) {
    var elements = template.content.querySelectorAll(tag);
    elements.forEach(function(node) {
      node.parentNode.removeChild(node);
    });
  });

  // Remove dangerous attributes from all elements
  template.content.querySelectorAll('*').forEach(function(el) {
    // Convert to array since we'll modify during iteration
    Array.from(el.attributes).forEach(function(attr) {
      var name = attr.name.toLowerCase();
      var value = (attr.value || '').toLowerCase().trim();

      // Remove event handlers (onclick, onerror, etc.)
      if (name.indexOf('on') === 0) {
        el.removeAttribute(attr.name);
        return;
      }

      // Remove javascript: URLs
      if ((name === 'href' || name === 'src' || name === 'action' || name === 'formaction') && 
          value.indexOf('javascript:') === 0) {
        el.removeAttribute(attr.name);
        return;
      }

      // Remove data: URLs for src (can be used for XSS in some contexts)
      if (name === 'src' && value.indexOf('data:text/html') === 0) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
}

// Validate paper size against allowed values
function validatePaperSize(value) {
  var allowedSizes = ['a4', 'a3', 'a5', 'letter', 'legal', 'tabloid'];
  var normalized = (value || '').toLowerCase().trim();
  return allowedSizes.indexOf(normalized) !== -1 ? normalized : 'a4';
}

// Validate orientation against allowed values
function validateOrientation(value) {
  var allowedOrientations = ['portrait', 'landscape'];
  var normalized = (value || '').toLowerCase().trim();
  return allowedOrientations.indexOf(normalized) !== -1 ? normalized : 'portrait';
}

// Get plugin parameters with defaults and validation
var rawContent = getPluginParameter('content');
var content = sanitizeHtml(rawContent);
var marginslr = parseMargin(getPluginParameter('marginslr'), 10);
var marginstb = parseMargin(getPluginParameter('marginstb'), 15);
var filename = getPluginParameter('filename') || 'document.pdf';
var paperSize = validatePaperSize(getPluginParameter('paperSize'));
var orientation = validateOrientation(getPluginParameter('orientation'));

// Add .pdf extension if not included in filename
if (!filename.toLowerCase().endsWith('.pdf')) {
  filename += '.pdf';
}

// Detect platform using SurveyCTO body classes
var isAndroidCollect = document.body.classList.contains('android-collect');
var isIOSCollect = document.body.classList.contains('ios-collect');
var isWebCollect = document.body.classList.contains('web-collect');

// Native collect apps use WebView where PDF preview may not work reliably
var isWebView = isAndroidCollect || isIOSCollect;

// Helper to manage UI busy state consistently
function setBusy(isBusy) {
  if (loadingIndicator) loadingIndicator.style.display = isBusy ? 'block' : 'none';
  if (createButton) createButton.disabled = isBusy;
  if (previewButton) previewButton.disabled = isBusy;
  if (downloadFromPreviewBtn) downloadFromPreviewBtn.disabled = isBusy;
}

// Function to prepare content for PDF generation
function prepareContentForPDF(htmlContent) {
  var wrapper = document.createElement('div');
  wrapper.innerHTML = htmlContent;
  
  // Find the main container
  var mainContainer = wrapper.querySelector('div[style*="box-shadow"]') || wrapper.firstElementChild;
  
  if (mainContainer) {
    var currentStyle = mainContainer.getAttribute('style') || '';
    
    // Remove border, box-shadow, and background from main container
    currentStyle = currentStyle
      .replace(/border\s*:[^;]+;/gi, '')
      .replace(/box-shadow\s*:[^;]+;/gi, '')
      .replace(/background-color\s*:[^;]+;/gi, '');
        
    if (!currentStyle.includes('padding')) {
      currentStyle += 'padding: 0;';
    }
    
    mainContainer.setAttribute('style', currentStyle);
    mainContainer.classList.add('pdf-content-container');
  }
  
  // Apply background to individual sections
  var sections = wrapper.querySelectorAll('section');
  sections.forEach(function(section, index) {
    section.style.backgroundColor = '#f9f9f9';
    section.style.border = '1px solid #ddd';
    section.style.padding = '20px';
    section.style.marginBottom = '25px';
    section.style.borderRadius = '4px';
    section.style.pageBreakInside = 'avoid';
    section.style.breakInside = 'avoid';
    
    if (index < sections.length - 1) {
      section.style.marginBottom = '30px';
    }
  });
  
  // Add CSS for page-specific styling
  var style = document.createElement('style');
  style.textContent = 
    '@page { margin: ' + marginstb + 'mm ' + marginslr + 'mm; background-color: white; }\n' +
    '.pdf-content-container { padding: 0; margin: 0; }\n' +
    '.pdf-content-container section { background-color: #f9f9f9 !important; border: 1px solid #ddd !important; padding: 20px !important; margin-bottom: 25px !important; border-radius: 4px; page-break-inside: avoid; break-inside: avoid; display: block; }\n' +
    '.pdf-content-container section:last-child { margin-bottom: 0 !important; }\n' +
    '.pdf-content-container h4 { margin-top: 0; margin-bottom: 15px; page-break-after: avoid; break-after: avoid; }\n' +
    '.pdf-content-container section > div { page-break-inside: avoid; break-inside: avoid; }';
  
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
if (createButton) {
  createButton.addEventListener('click', function() {
    generatePDF(true);
  });
}

// Preview PDF
if (previewButton) {
  previewButton.addEventListener('click', function() {
    generatePDF(false);
  });
}

// Close modal handlers
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closePreview);
}

if (closePreviewBtn) {
  closePreviewBtn.addEventListener('click', closePreview);
}

if (downloadFromPreviewBtn) {
  downloadFromPreviewBtn.addEventListener('click', function() {
    if (errorContainer) errorContainer.textContent = '';
    if (resultContainer) resultContainer.textContent = '';
    setBusy(true);
    
    try {
      var preparedContent = prepareContentForPDF(content);
      html2pdf().set(opt).from(preparedContent).save()
        .then(function() {
          if (resultContainer) resultContainer.textContent = 'PDF downloaded successfully!';
          setBusy(false);
        })
        .catch(handleError);
    } catch (error) {
      handleError(error);
    }
  });
}

// Close when clicking outside modal - using addEventListener instead of overwriting window.onclick
window.addEventListener('click', function(event) {
  if (event.target === previewModal) {
    closePreview();
  }
});

// Escape key to close modal (accessibility)
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' || event.keyCode === 27) {
    if (previewModal && previewModal.style.display === 'block') {
      closePreview();
    }
  }
});

// Function to generate PDF (download if isDownload=true, preview if false)
function generatePDF(isDownload) {
  // Clear previous messages
  if (errorContainer) errorContainer.textContent = '';
  if (resultContainer) resultContainer.textContent = '';
  
  // Check for valid content
  if (!content || !content.trim()) {
    if (errorContainer) errorContainer.textContent = 'No content available to generate a PDF.';
    console.warn('Print PDF Plugin: No content provided');
    return;
  }
  
  setBusy(true);
  console.log('Print PDF Plugin: Generating PDF...', { isDownload: isDownload, paperSize: paperSize, orientation: orientation });
  
  try {
    var preparedContent = prepareContentForPDF(content);
    
    if (isDownload) {
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
          
          if (resultContainer) resultContainer.textContent = 'PDF downloaded successfully!' + platform;
          console.log('Print PDF Plugin: PDF downloaded successfully');
          setBusy(false);
        })
        .catch(handleError);
    } else {
      // Clear previous preview
      if (previewContainer) previewContainer.innerHTML = '';
      
      // Revoke previous blob URL if exists
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = null;
      }
      
      if (isWebView) {
        showHTMLPreview(preparedContent);
      } else {
        // Use blob URL instead of data URI for better performance with large PDFs
        html2pdf().set(opt)
          .from(preparedContent)
          .outputPdf('blob')
          .then(function(pdfBlob) {
            var blobUrl = URL.createObjectURL(pdfBlob);
            currentPreviewUrl = blobUrl;
            showPDFPreview(blobUrl);
          })
          .catch(function(error) {
            console.warn('Print PDF Plugin: PDF preview failed, falling back to HTML:', error);
            showHTMLPreview(preparedContent);
          });
      }
    }
  } catch (error) {
    handleError(error);
  }
}

// Function to show HTML preview (WebView-friendly fallback)
function showHTMLPreview(preparedContent) {
  var previewDiv = document.createElement('div');
  previewDiv.className = 'html-preview';
  previewDiv.style.cssText = 
    'width: 100%; max-height: 500px; overflow-y: auto; border: 1px solid #ddd; ' +
    'padding: 20px; background-color: white; font-family: Arial, sans-serif;';
  
  var contentClone = preparedContent.cloneNode(true);
  
  var header = document.createElement('div');
  header.style.cssText = 
    'background-color: #f0f0f0; padding: 10px; margin-bottom: 15px; border-radius: 4px; ' +
    'font-size: 14px; color: #666; text-align: center;';
  header.textContent = 'HTML Preview (PDF will be formatted differently)';
  
  previewDiv.appendChild(header);
  previewDiv.appendChild(contentClone);
  
  if (previewContainer) previewContainer.appendChild(previewDiv);
  if (previewModal) {
    previewModal.style.display = 'block';
    // Focus management for accessibility
    if (closeModalBtn) closeModalBtn.focus();
  }
  
  setBusy(false);
}

// Function to show PDF preview (regular browsers)
function showPDFPreview(pdfUrl) {
  var iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '500px';
  iframe.style.border = 'none';
  iframe.title = 'PDF Preview';
  iframe.src = pdfUrl;
  
  if (previewContainer) previewContainer.appendChild(iframe);
  if (previewModal) {
    previewModal.style.display = 'block';
    // Focus management for accessibility
    if (closeModalBtn) closeModalBtn.focus();
  }
  
  console.log('Print PDF Plugin: PDF preview displayed');
  setBusy(false);
}

// Function to close preview modal
function closePreview() {
  if (previewModal) previewModal.style.display = 'none';
  if (previewContainer) previewContainer.innerHTML = '';
  
  // Clean up blob URL to prevent memory leaks
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
  
  // Return focus to preview button for accessibility
  if (previewButton) previewButton.focus();
}

// Error handler function
function handleError(error) {
  var message = (error && error.message) ? error.message : String(error || 'Unknown error');
  console.error('Print PDF Plugin: Error -', message, error);
  
  if (errorContainer) {
    errorContainer.textContent = 'Error generating PDF: ' + message + '. Please try again.';
  }
  setBusy(false);
}
