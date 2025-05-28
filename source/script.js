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
        // Update the container's style to ensure proper padding
        var currentStyle = mainContainer.getAttribute('style') || '';
        
        // Replace the border with a background shade instead
        currentStyle = currentStyle
            .replace(/border:[^;]+;/g, '')
            .replace(/box-shadow:[^;]+;/g, '');
            
        // Ensure adequate padding
        if (!currentStyle.includes('padding')) {
            currentStyle += 'padding: 20px;';
        }
        
        // Add margin to prevent content from touching edges
        if (!currentStyle.includes('margin')) {
            currentStyle += 'margin: 0;';
        }
        
        // Add a light background color
        currentStyle += 'background-color: #f9f9f9;';
        
        mainContainer.setAttribute('style', currentStyle);
        
        // Add a container class for styling
        mainContainer.classList.add('pdf-content-container');
    }
    
    // Find all sections and ensure they have proper spacing
    var sections = wrapper.querySelectorAll('section');
    sections.forEach(function(section, index) {
        // Add margin between sections
        section.style.marginBottom = '25px';
        
        // Add a thin bottom border instead of using a box
        if (index < sections.length - 1) {
            section.style.borderBottom = '1px solid #eaeaea';
            section.style.paddingBottom = '15px';
        }
        
        // Remove any page break properties from the last section
        if (index === sections.length - 1) {
            section.style.pageBreakAfter = 'avoid';
            section.style.breakAfter = 'avoid';
        }
    });
    
    // Add CSS to control page breaks and spacing
    var style = document.createElement('style');
    style.textContent = `
        .pdf-content-container {
            border: 1px solid #ddd;
            background-color: #fff;
            padding: 20px;
            page-break-after: avoid;
            break-after: avoid;
        }
        
        h4 {
            margin-top: 15px;
            margin-bottom: 15px;
            page-break-after: avoid;
            break-after: avoid;
        }
        
        section {
            page-break-inside: auto;
            break-inside: auto;
        }
        
        section > div {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        @page {
            margin-bottom: 0;
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
