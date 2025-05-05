


import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

import './App.css'
const TOGETHER_API_KEY = "ffd96bebc08219a7dd524b0846b1c4fd6d603c5142343ec7fe6157d8dde2bf7c";

function App() {
  const [files, setFiles] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const dropAreaRef = useRef(null);

  // Handle clipboard paste events (for copying images)
  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        const imageItems = [];
        
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              // Create a new file with a unique name to avoid duplicates
              const uniqueFile = new File(
                [file], 
                `pasted_image_${Date.now()}_${i}.${file.name.split('.').pop() || 'png'}`,
                { type: file.type }
              );
              imageItems.push(uniqueFile);
            }
          }
        }
        
        if (imageItems.length > 0) {
          setFiles(prevFiles => [...prevFiles, ...imageItems]);
          setError(null);
        }
      }
    };

    // Add paste event listener to document
    document.addEventListener('paste', handlePaste);
    
    // Clean up the event listener
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Handle drag and drop events
  useEffect(() => {
    const dropArea = dropAreaRef.current;
    
    if (!dropArea) return;
    
    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };
    
    const handleDragLeave = () => {
      setIsDragging(false);
    };
    
    const handleDrop = (e) => {
      e.preventDefault();
      setIsDragging(false);
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const newFiles = Array.from(e.dataTransfer.files).filter(file => 
          file.type.startsWith('image/')
        );
        
        if (newFiles.length > 0) {
          setFiles(prevFiles => [...prevFiles, ...newFiles]);
          setError(null);
        } else {
          setError("Please drop image files only");
        }
      }
    };
    
    // Add event listeners
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);
    
    // Clean up event listeners
    return () => {
      dropArea.removeEventListener('dragover', handleDragOver);
      dropArea.removeEventListener('dragleave', handleDragLeave);
      dropArea.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
    setError(null);
  };
  
  const removeFile = (index) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };
  
  const clearAllFiles = () => {
    setFiles([]);
  };

  // Function to safely extract JSON from a string
  const extractJSON = (str) => {
    try {
      // Try direct parsing first
      return JSON.parse(str.trim());
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // Look for JSON array pattern
      const jsonArrayRegex = /\[\s*\{[^]*\}\s*\]/g;
      const matches = str.match(jsonArrayRegex);
      
      if (matches && matches.length > 0) {
        try {
          return JSON.parse(matches[0]);
        // eslint-disable-next-line no-unused-vars
        } catch (e2) {
          // Try a more aggressive approach to clean the string
          let cleanedStr = matches[0]
            .replace(/\\n/g, '')
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\&/g, "&")
            .replace(/\\r/g, '')
            .replace(/\\t/g, '')
            .replace(/\\b/g, '')
            .replace(/\\f/g, '')
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u0019]+/g, "");
            
          try {
            return JSON.parse(cleanedStr);
          // eslint-disable-next-line no-unused-vars
          } catch (e3) {
            throw new Error("Failed to parse JSON after multiple attempts");
          }
        }
      }
      
      // Try to locate JSON by finding balanced brackets
      let startIdx = str.indexOf('[');
      if (startIdx !== -1) {
        let bracketCount = 0;
        let endIdx = -1;
        
        for (let i = startIdx; i < str.length; i++) {
          if (str[i] === '[') bracketCount++;
          if (str[i] === ']') bracketCount--;
          
          if (bracketCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
        
        if (endIdx !== -1) {
          let jsonCandidate = str.substring(startIdx, endIdx);
          try {
            return JSON.parse(jsonCandidate);
          // eslint-disable-next-line no-unused-vars
          } catch (e4) {
            throw new Error("Failed to parse extracted JSON substring");
          }
        }
      }
      
      // For problematic responses, try an even more aggressive approach
      // Look for array-like structures with objects inside
      try {
        // Find all patterns that look like JSON objects
        const objRegex = /\{[^{}]*"name"[^{}]*"price"[^{}]*\}/g;
        const objMatches = str.match(objRegex);
        
        if (objMatches && objMatches.length > 0) {
          // Try to combine these into a valid JSON array
          const combinedJson = "[" + objMatches.join(",") + "]";
          return JSON.parse(combinedJson);
        }
      } catch (e5) {
        console.log("Failed to extract JSON objects:", e5);
      }
      
      // Last resort: Create empty array to prevent failure
      console.log("No valid JSON found, returning empty array");
      return [];
    }
  };

  // Function to make API requests with retry mechanism
  const makeAPIRequest = async (messages, temperature, retryCount = 0) => {
    try {
      const res = await axios.post(
        "/api/chat/completions",
        {
          model: "meta-llama/Llama-Vision-Free",
          messages: messages,
          max_tokens: 2000,
          temperature: temperature
        },
        {
          headers: {
            Authorization: `Bearer ${TOGETHER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      
      return res.data.choices[0].message.content;
    } catch (error) {
      // Retry with exponential backoff if we haven't exceeded retry count
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`API request failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return makeAPIRequest(messages, temperature, retryCount + 1);
      } else {
        throw error; // Give up after 3 retries
      }
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setCombinedData([]);
    setProcessedCount(0);
    setCopySuccess(false);

    // Create an array to hold all file data
    const imagesData = [];
    
    // First, process all images to base64
    for (const file of files) {
      try {
        const base64Image = await toBase64(file);
        imagesData.push({
          name: file.name,
          type: file.type,
          base64: base64Image
        });
      } catch (error) {
        console.error("Error converting file to base64:", file.name, error);
        setError(`Error preparing ${file.name}: ${error.message}`);
      }
    }
    
    // Function to process images one at a time for more reliable results
    const processImages = async () => {
      const results = [];
      
      // Process each image individually for better reliability
      for (let i = 0; i < imagesData.length; i++) {
        const img = imagesData[i];
        console.log(`Processing image ${i + 1} of ${imagesData.length}: ${img.name}`);
        
        // Create improved system prompt with clearer and more specific instructions
        const systemPrompt = 
          "Your task is to extract menu items from images and format them as a structured JSON array. " +
          "IMPORTANT: " +
          "- IGNORE all serial numbers/item numbers when identifying dish names. " +
          "- Prices are typically positioned to the right side of each dish name. " +
          "- When no description is provided in the menu, create a brief appropriate description based on the dish name. " +
          "- The main section titles in the menu should be used as category names. " +
          "- If dishes don't have an explicit category, analyze them to identify common characteristics and assign an appropriate category name. " +
          "Format output as a valid JSON array with items having these fields: " +
          "{\"name\": string, \"price\": number, \"description\": string, \"category\": string}. " +
          "Be thorough and extract ALL menu items visible in the image. " +
          "Prices must be numeric values only (no currency symbols). " +
          "Return ONLY the JSON array without any explanations or markdown.";
        
        // Create user prompt that's more specific about the task
        const userPrompt = 
          "Extract menu items from the provided image and convert them into a valid JSON array following these specifications:\n\n" +
          "1. Required JSON Structure for each item:\n" +
          "{\n" +
          "  \"name\": \"string (item name)\",\n" +
          "  \"price\": number (numeric value only, no currency symbols),\n" +
          "  \"description\": \"string (brief 5-10 word description)\",\n" +
          "  \"category\": \"string (section/category name from menu)\"\n" +
          "}\n\n" +
          "2. Critical Rules:\n" +
          "   - IGNORE all serial numbers/item numbers when identifying dish names\n" +
          "   - Prices are typically positioned to the right side of each dish name\n" +
          "   - When no description is provided in the menu, create a brief appropriate description based on the dish name\n" +
          "   - The main section titles in the menu should be used as category names\n" +
          "   - If dishes don't have an explicit category, analyze them to identify common characteristics and assign an appropriate category name\n\n" +
          "3. Output Requirements:\n" +
          "   - Prices must be numeric values only (15.99, not $15.99)\n" +
          "   - Descriptions should be concise but descriptive (5-10 words)\n" +
          "   - Output must be valid JSON (no trailing commas, proper formatting)\n" +
          "   - Return ONLY the JSON array with no additional text or explanations";
        
        // Create messages with only one image
        const messages = [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: userPrompt 
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/${img.type};base64,${img.base64}`
                }
              }
            ]
          }
        ];
        
        try {
          // First attempt with normal temperature
          const content = await makeAPIRequest(messages, 0.2);
          console.log("Raw response for", img.name, ":", content);
          
          try {
            // Try to extract and parse JSON from the response
            const menuData = extractJSON(content);
            
            // Check if we got valid results
            if (!Array.isArray(menuData) || menuData.length === 0) {
              console.log("First attempt yielded no results, trying a second approach");
              
              // Try a different prompt approach
              const secondMessages = [
                {
                  role: "system",
                  content: "You are an expert at extracting menu items from images. IGNORE all serial numbers/item numbers. Prices are typically positioned to the right side of each dish name. The main section titles in the menu should be used as category names. If dishes don't have an explicit category, assign an appropriate one based on analysis. Format as JSON array with {name, price (numeric only), description, category}. Even if the image is low quality, try your best to identify menu items."
                },
                {
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: "This is a restaurant menu image. Extract ALL menu items with their prices. Create brief descriptions for items that don't have them. Return a JSON array only." 
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/${img.type};base64,${img.base64}`
                      }
                    }
                  ]
                }
              ];
              
              // Try with higher temperature
              const secondContent = await makeAPIRequest(secondMessages, 0.7);
              const secondMenuData = extractJSON(secondContent);
              
              if (Array.isArray(secondMenuData) && secondMenuData.length > 0) {
                results.push({
                  filename: img.name,
                  data: secondMenuData,
                  note: "Second attempt was needed for this image"
                });
              } else {
                // If still no results, try one last approach
                const thirdMessages = [
                  {
                    role: "system",
                    content: "You are an expert at extracting text and data from images. Your task is to identify any food items and their prices in this image, regardless of format or quality. IGNORE all serial numbers and item numbers. Create appropriate descriptions if none exist. Identify logical categories for groups of dishes."
                  },
                  {
                    role: "user",
                    content: [
                      { 
                        type: "text", 
                        text: "Create a list of menu items from this image. For each item found, include name (ignore item numbers), price (as a number only), a brief description, and category. Return as a JSON array." 
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/${img.type};base64,${img.base64}`
                        }
                      }
                    ]
                  }
                ];
                
                const thirdContent = await makeAPIRequest(thirdMessages, 0.9);
                const thirdMenuData = extractJSON(thirdContent);
                
                results.push({
                  filename: img.name,
                  data: thirdMenuData,
                  note: "Third attempt was needed for this image"
                });
              }
            } else {
              // First attempt was successful
              results.push({
                filename: img.name,
                data: menuData
              });
            }
          } catch (parseError) {
            console.error("JSON parsing error for", img.name, ":", parseError.message);
            
            // Try a final attempt with a different format request
            try {
              const finalMessages = [
                {
                  role: "system",
                  content: "Extract menu items from this image. IGNORE all serial numbers. Create brief descriptions for dishes. Identify logical categories from section titles. Your response MUST be a valid JSON array with each item having name, price, description, and category fields. Price must be a number with no currency symbols."
                },
                {
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: "Extract menu items from this image. Ignore item numbers, create appropriate descriptions, and identify logical categories. Format your response as a plain JSON array with no explanations." 
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/${img.type};base64,${img.base64}`
                      }
                    }
                  ]
                }
              ];
              
              const finalContent = await makeAPIRequest(finalMessages, 0.5);
              const finalMenuData = extractJSON(finalContent);
              
              results.push({
                filename: img.name,
                data: finalMenuData,
                note: "Recovery attempt after parsing error"
              });
            // eslint-disable-next-line no-unused-vars
            } catch (finalError) {
              results.push({
                filename: img.name,
                error: {
                  message: `Error parsing JSON: ${parseError.message}`,
                  rawResponse: content
                }
              });
            }
          }
        } catch (apiError) {
          console.error("API error for", img.name, ":", apiError);
          
          results.push({
            filename: img.name,
            error: {
              message: `API Error: ${apiError.message}`,
              response: apiError.response ? {
                status: apiError.response.status,
                data: apiError.response.data
              } : 'No response'
            }
          });
          
          setError(`Error processing ${img.name}: ${apiError.message}`);
        } finally {
          // Update processed count
          setProcessedCount(prev => prev + 1);
        }
      }
      
      return results;
    };



    // Process all images and get results
    const results = await processImages();
    
    setCombinedData(results);
    setLoading(false);
  };

  const toBase64 = (file) => 
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Extract only the base64 part without the data URL prefix
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (err) => reject(err);
    });

  // Function to copy all menu items to clipboard
  const copyToClipboard = () => {
    // Extract and combine menu items from all images
    const allMenuItems = [];
    
    combinedData.forEach(result => {
      if (!result.error && result.data && Array.isArray(result.data)) {
        // Add source filename as a property to each menu item
        const itemsWithSource = result.data.map(item => ({
          ...item,
          source: result.filename
        }));
        allMenuItems.push(...itemsWithSource);
      }
    });
    
    // Convert to JSON string
    const dataStr = JSON.stringify(allMenuItems, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(dataStr)
      .then(() => {
        setCopySuccess(true);
        // Reset success message after 3 seconds
        setTimeout(() => {
          setCopySuccess(false);
        }, 3000);
      })
      .catch(err => {
        setError(`Failed to copy: ${err.message}`);
      });
  };

  // Get the total number of successfully extracted menu items
  const getTotalMenuItems = () => {
    return combinedData.reduce((total, result) => {
      if (!result.error && result.data && Array.isArray(result.data)) {
        return total + result.data.length;
      }
      return total;
    }, 0);
  };

  return (
    <div className="container">
      <h2>Restaurant Menu Extractor</h2>
      
      {/* Drag & Drop Area */}
      <div 
        ref={dropAreaRef}
        className={`drop-area ${isDragging ? 'dragging' : ''}`}
      >
        <div className="drop-area-content">
          <h3>Add Menu Images</h3>
          <p>
            Drag & drop images here, paste from clipboard, or select files
          </p>
          
          <div className="button-container">
            <label 
              htmlFor="file-upload"
              className="file-select-button"
            >
              Select Images
            </label>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="file-input"
            />
          </div>
        </div>
        
        {/* File preview area */}
        {files.length > 0 && (
          <div>
            <div className="preview-header">
              <h4>Selected Images ({files.length})</h4>
              <button
                onClick={clearAllFiles}
                className="clear-button"
              >
                Clear All
              </button>
            </div>
            
            <div className="preview-container">
              {files.map((file, index) => (
                <div key={index} className="image-preview">
                  <img 
                    src={URL.createObjectURL(file)} 
                    alt={`Preview ${index}`}
                    className="preview-image"
                  />
                  <button
                    onClick={() => removeFile(index)}
                    className="remove-button"
                  >
                    ×
                  </button>
                  <div className="file-name-label">
                    {file.name.length > 10 ? file.name.substring(0, 10) + '...' : file.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="action-buttons">
        <button 
          onClick={handleSubmit} 
          disabled={loading || files.length === 0}
          className="process-button"
        >
          {loading ? `Processing... (${processedCount}/${files.length})` : `Process ${files.length} Images`}
        </button>
        
        {combinedData.length > 0 && (
          <button
            onClick={copyToClipboard}
            className={`copy-button ${copySuccess ? 'success' : ''}`}
          >
            {copySuccess ? "Copied!" : `Copy All Menu Items (${getTotalMenuItems()})`}
          </button>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="error-message">
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="error-close-button"
          >
            ×
          </button>
        </div>
      )}
      
      {/* Combined Result Summary */}
      {combinedData.length > 0 && (
        <div className="results-summary">
          <h3>Combined Results</h3>
          <p><strong>Total menu items extracted:</strong> {getTotalMenuItems()}</p>
          <p><strong>Images processed:</strong> {combinedData.length}</p>
          
          <div className="json-preview">
            <pre className="json-content">
              {JSON.stringify(
                combinedData.flatMap(result => 
                  !result.error && result.data ? 
                    result.data : 
                    []
                ),
                null, 2
              )}
            </pre>
          </div>
        </div>
      )}

      {/* Individual Results */}
      {combinedData.length > 0 && (
        <div className="results-container">
          <h3>Individual Results</h3>
          {combinedData.map((result, index) => (
            <div key={index} className={`result-item ${result.error ? 'error' : 'success'}`}>
              <h4>{result.filename}</h4>
              {result.error ? (
                <div>
                  <p className="error-text"><strong>Error:</strong> {result.error.message}</p>
                  {result.error.rawResponse && (
                    <div>
                      <p><strong>Raw Response:</strong></p>
                      <pre className="raw-response">
                        {result.error.rawResponse}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p>
                    <strong>Items extracted:</strong> {result.data.length}
                    {result.note && (
                      <span className="item-count">
                        {result.note}
                      </span>
                    )}
                  </p>
                  {result.data.length === 0 ? (
                    <p className="error-text">No menu items could be extracted from this image.</p>
                  ) : (
                    <div className="data-preview">
                      <pre className="json-content">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;

