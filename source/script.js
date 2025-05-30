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

// Get plugin parameters with defaults
var content = getPluginParameter('content');
var marginslr = getPluginParameter('marginslr') || 10; // Default 10mm left/right margin
var marginstb = getPluginParameter('marginstb') || 15; // Default 15mm top/bottom margin
var filename = getPluginParameter('filename') || 'document.pdf'; // Default filename
var paperSize = getPluginParameter('paperSize') || 'a4';
var orientation = getPluginParameter('orientation') || 'portrait';

// Add .pdf extension if not included in filename
if (!filename.toLowerCase().endsWith('.pdf')) {
    filename += '.pdf';
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
            .replace(/border:[^;]+;/g, '')
            .replace(/box-shadow:[^;]+;/g, '')
            .replace(/background-color:[^;]+;/g, '');
            
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
    
    // Add CSS for page-specific styling
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
        
        section {
            background-color: #f9f9f9 !important;
            border: 1px solid #ddd !important;
            padding: 20px !important;
            margin-bottom: 25px !important;
            border-radius: 4px;
            page-break-inside: avoid;
            break-inside: avoid;
            display: block;
        }
        
        section:last-child {
            margin-bottom: 0 !important;
        }
        
        h4 {
            margin-top: 0;
            margin-bottom: 15px;
            page-break-after: avoid;
            break-after: avoid;
        }
        
        /* Ensure content within sections doesn't break awkwardly */
        section > div {
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
  var preparedContent = prepareContentForPDF(content);
  html2pdf().set(opt).from(preparedContent).save();
  resultContainer.textContent = 'PDF downloaded successfully!';
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
  
  // Show loading indicator and disable buttons
  loadingIndicator.style.display = 'block';
  createButton.disabled = true;
  previewButton.disabled = true;
  
  try {
    // Prepare the content with proper styling and page breaks
    var preparedContent = prepareContentForPDF(content);
    
    if (isDownload) {
      // Generate and download PDF
      html2pdf().set(opt)
        .from(preparedContent)
        .save()
        .then(function() {
          resultContainer.textContent = 'PDF downloaded successfully!';
          loadingIndicator.style.display = 'none';
          createButton.disabled = false;
          previewButton.disabled = false;
        })
        .catch(handleError);
    } else {
      // Clear previous preview
      previewContainer.innerHTML = '';
      
      // Generate preview
      html2pdf().set(opt)
        .from(preparedContent)
        .outputPdf('datauristring')
        .then(function(pdfDataUri) {
          // Create an iframe to display the PDF
          var iframe = document.createElement('iframe');
          iframe.style.width = '100%';
          iframe.style.height = '500px';
          iframe.style.border = 'none';
          iframe.src = pdfDataUri;
          
          previewContainer.appendChild(iframe);
          previewModal.style.display = 'block';
          
          loadingIndicator.style.display = 'none';
          createButton.disabled = false;
          previewButton.disabled = false;
        })
        .catch(handleError);
    }
  } catch (error) {
    handleError(error);
  }
}

// Function to close preview modal
function closePreview() {
  previewModal.style.display = 'none';
}

// Error handler function
function handleError(error) {
  errorContainer.textContent = 'Error: ' + error.message;
  loadingIndicator.style.display = 'none';
  createButton.disabled = false;
  previewButton.disabled = false;
}
