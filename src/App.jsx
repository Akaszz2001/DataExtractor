



//testing 

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import './App.css';

const TOGETHER_API_KEY = "ffd96bebc08219a7dd524b0846b1c4fd6d603c5142343ec7fe6157d8dde2bf7c";

function App() {
  const [files, setFiles] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageGenerationLoading, setImageGenerationLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [imageProcessedCount, setImageProcessedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [partialImageLoading, setPartialImageLoading] = useState(false);
  const dropAreaRef = useRef(null);

  // Handle clipboard paste events
  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData?.items) {
        const imageItems = Array.from(e.clipboardData.items)
          .filter(item => item.type.indexOf('image') !== -1)
          .map(item => {
            const file = item.getAsFile();
            if (!file) return null;
            return new File(
              [file],
              `pasted_image_${Date.now()}_${Math.random().toString(36).substring(2)}.${file.name.split('.').pop() || 'png'}`,
              { type: file.type }
            );
          })
          .filter(Boolean);

        if (imageItems.length > 0) {
          setFiles(prev => [...prev, ...imageItems]);
          setError(null);
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Handle drag and drop events
  useEffect(() => {
    if (!dropAreaRef.current) return;

    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e) => {
      e.preventDefault();
      setIsDragging(false);
      
      if (e.dataTransfer.files?.length > 0) {
        const newFiles = Array.from(e.dataTransfer.files).filter(file => 
          file.type.startsWith('image/')
        );
        
        if (newFiles.length > 0) {
          setFiles(prev => [...prev, ...newFiles]);
          setError(null);
        } else {
          setError("Please drop image files only");
        }
      }
    };

    const dropArea = dropAreaRef.current;
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);

    return () => {
      dropArea.removeEventListener('dragover', handleDragOver);
      dropArea.removeEventListener('dragleave', handleDragLeave);
      dropArea.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...newFiles]);
    setError(null);
  };

  const removeFile = (index) => setFiles(prev => prev.filter((_, i) => i !== index));
  const clearAllFiles = () => setFiles([]);

  // Function to safely extract JSON from a string
  const extractJSON = (str) => {
    try {
      return JSON.parse(str.trim());
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // Try various approaches to extract JSON
      try {
        // Look for JSON array pattern
        const jsonArrayRegex = /\s*\[.*\]\s*/s;
        const matches = str.match(jsonArrayRegex);

        if (matches?.[0]) {
          // eslint-disable-next-line no-control-regex
          return JSON.parse(matches[0].replace(/[\u0000-\u0019]+/g, ""));
        }
        
        // Find all patterns that look like JSON objects
        const objRegex = /\{[^{}]*"name"[^{}]*"price"[^{}]*\}/g;
        const objMatches = str.match(objRegex);
        
        if (objMatches?.length > 0) {
          return JSON.parse("[" + objMatches.join(",") + "]");
        }
      } catch(e){
        console.log(e);
      } // Silently handle nested parsing errors
      
      // Last resort: return empty array
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
          messages,
          max_tokens: 2000,
          temperature
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
      // Retry with exponential backoff
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`API request failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return makeAPIRequest(messages, temperature, retryCount + 1);
      }
      throw error;
    }
  };

  // Convert file to base64
  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });

  // Create prompt variations for menu extraction
  const createPrompts = (imageBase64, imageType) => [
    // First attempt prompt
    {
      messages: [
        {
          role: "system",
          content: "Your task is to extract menu items from images and format them as a structured JSON array. IMPORTANT: IGNORE all serial numbers/item numbers when identifying dish names. Prices are typically positioned to the right side of each dish name. When no description is provided in the menu, create a brief appropriate description based on the dish name. The main section titles in the menu should be used as category names. Format output as a valid JSON array with items having these fields: {\"name\": string, \"price\": number, \"description\": string, \"category\": string}."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract menu items from the provided image and convert them into a valid JSON array with name, price (numeric only), description, and category fields. Return ONLY the JSON array."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${imageType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      temperature: 0.2
    },
    // Backup prompt
    {
      messages: [
        {
          role: "system",
          content: "You are an expert at extracting menu items from images. IGNORE all serial numbers/item numbers. Prices are typically positioned to the right side of each dish name. The main section titles in the menu should be used as category names. Format as JSON array with {name, price (numeric only), description, category}."
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
                url: `data:image/${imageType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      temperature: 0.7
    },
    // Final attempt prompt
    {
      messages: [
        {
          role: "system",
          content: "Extract menu items from this image. IGNORE all serial numbers. Create brief descriptions for dishes. Identify logical categories from section titles. Your response MUST be a valid JSON array with each item having name, price, description, and category fields."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract menu items from this image. Format your response as a plain JSON array with no explanations."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${imageType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      temperature: 0.9
    }
  ];

  // Process a single image
  const processImage = async (imageData) => {
    const prompts = createPrompts(imageData.base64, imageData.type);

    for (let i = 0; i < prompts.length; i++) {
      try {
        const content = await makeAPIRequest(prompts[i].messages, prompts[i].temperature);
        const menuData = extractJSON(content);
        
        if (Array.isArray(menuData) && menuData.length > 0) {
          return {
            filename: imageData.name,
            data: menuData,
            note: i > 0 ? `Attempt #${i+1} was needed for this image` : undefined
          };
        }
      } catch (error) {
        console.error(`Error in attempt ${i+1} for ${imageData.name}:`, error);
        if (i === prompts.length - 1) {
          return {
            filename: imageData.name,
            error: { message: `Failed after ${prompts.length} attempts: ${error.message}` }
          };
        }
      }
    }

    return {
      filename: imageData.name,
      error: { message: "Could not extract menu items after multiple attempts" }
    };
  };

  const handlePartialImageGeneration = async () => {
    // Get all menu items from combinedData
    const allItems = combinedData
      .filter(result => !result.error && result.data && Array.isArray(result.data))
      .flatMap(result => result.data);
    
    if (allItems.length === 0) {
      setError("No menu items to generate images for");
      return;
    }
    
    setPartialImageLoading(true);
    setImageProcessedCount(0);
    setError(null);
    
    try {
      // Create a deep copy of combinedData
      const updatedData = JSON.parse(JSON.stringify(combinedData));
      
      // Send all dishes to the partial image generation endpoint
      const response = await axios.post('http://localhost:3000/partialImages', allItems, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Process the response and update the data
      if (response.data && Array.isArray(response.data)) {
        // Create a map of dish name to image URL for quick lookup
        const dishImageMap = {};
        response.data.forEach(dish => {
          if (dish.name && dish.image) {
            dishImageMap[dish.name] = dish.image;
          }
        });
        
        // Update each dish in our data with its image URL
        let processedCount = 0;
        updatedData.forEach(result => {
          if (!result.error && result.data && Array.isArray(result.data)) {
            result.data.forEach(dish => {
              if (dishImageMap[dish.name]) {
                dish.image = dishImageMap[dish.name];
                processedCount++;
                setImageProcessedCount(processedCount);
              }
            });
          }
        });
        
        // Update the combinedData with the enhanced data
        setCombinedData(updatedData);
      } else {
        throw new Error("Invalid response from partial image generation server");
      }
      
    } catch (err) {
      setError(`Partial image generation error: ${err.message}`);
    } finally {
      setPartialImageLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    setCombinedData([]);
    setProcessedCount(0);
    setCopySuccess(false);
    setImageProcessedCount(0);

    try {
      // Prepare images data
      const imagesData = await Promise.all(
        files.map(async file => ({
          name: file.name,
          type: file.type,
          base64: await toBase64(file)
        }))
      );
      
      // Process images sequentially
      const results = [];
      for (let i = 0; i < imagesData.length; i++) {
        const result = await processImage(imagesData[i]);
        results.push(result);
        setProcessedCount(i + 1);
      }
      
      setCombinedData(results);
    } catch (err) {
      setError(`Processing error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Generate images for all dishes using the backend
  const handleGenerateImages = async () => {
    // Get all menu items from combinedData
    const allItems = combinedData
      .filter(result => !result.error && result.data && Array.isArray(result.data))
      .flatMap(result => result.data);
    
    if (allItems.length === 0) {
      setError("No menu items to generate images for");
      return;
    }
    
    setImageGenerationLoading(true);
    setImageProcessedCount(0);
    setError(null);
    
    try {
      // Create a deep copy of combinedData
      const updatedData = JSON.parse(JSON.stringify(combinedData));
      
      // Send all dishes to the backend in a single request
      const response = await axios.post('http://localhost:3000/fullImages', allItems, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Process the response and update the data
      if (response.data && Array.isArray(response.data)) {
        // Create a map of dish name to image URL for quick lookup
        const dishImageMap = {};
        response.data.forEach(dish => {
          if (dish.name && dish.image) {
            dishImageMap[dish.name] = dish.image;
          }
        });
        
        // Update each dish in our data with its image URL
        let processedCount = 0;
        updatedData.forEach(result => {
          if (!result.error && result.data && Array.isArray(result.data)) {
            result.data.forEach(dish => {
              if (dishImageMap[dish.name]) {
                dish.image = dishImageMap[dish.name];
                processedCount++;
                setImageProcessedCount(processedCount);
              }
            });
          }
        });
        
        // Update the combinedData with the enhanced data
        setCombinedData(updatedData);
      } else {
        throw new Error("Invalid response from image generation server");
      }
      
    } catch (err) {
      setError(`Image generation error: ${err.message}`);
    } finally {
      setImageGenerationLoading(false);
    }
  };


  // Copy all menu items to clipboard
  const copyToClipboard = () => {
    const allMenuItems = combinedData
      .filter(result => !result.error && result.data && Array.isArray(result.data))
      .flatMap(result => result.data.map(item => ({
        ...item,

      })));

    navigator.clipboard.writeText(JSON.stringify(allMenuItems, null, 2))
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      })
      .catch(err => setError(`Failed to copy: ${err.message}`));
  };

  // Get total number of extracted menu items
  const getTotalMenuItems = () => combinedData.reduce((total, result) =>
    !result.error && result.data && Array.isArray(result.data) ? total + result.data.length : total, 0);

  // Check if any items have images
  const hasGeneratedImages = () => {
    return combinedData.some(result => 
      !result.error && 
      result.data && 
      Array.isArray(result.data) && 
      result.data.some(item => item.image)
    );
  };

  // Count items with partial images
  const getItemsWithImages = () => {
    return combinedData.reduce((count, result) => {
      if (!result.error && result.data && Array.isArray(result.data)) {
        return count + result.data.filter(item => item.image).length;
      }
      return count;
    }, 0);
  };

  return (
    <div className="container">
      <h2>Restaurant Menu Extractor</h2>

      {/* Drag & Drop Area */}
      <div ref={dropAreaRef} className={`drop-area ${isDragging ? 'dragging' : ''}`}>
        <div className="drop-area-content">
          <h3>Add Menu Images</h3>
          <p>Drag & drop images here, paste from clipboard, or select files</p>
          
          <div className="button-container">
            <label htmlFor="file-upload" className="file-select-button">Select Images</label>
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
              <button onClick={clearAllFiles} className="clear-button">Clear All</button>
            </div>
            
            <div className="preview-container">
              {files.map((file, index) => (
                <div key={index} className="image-preview">
                  <img 
                    src={URL.createObjectURL(file)} 
                    alt={`Preview ${index}`}
                    className="preview-image"
                  />
                  <button onClick={() => removeFile(index)} className="remove-button">×</button>
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
          <div><strong>Error:</strong> {error}</div>
          <button onClick={() => setError(null)} className="error-close-button">×</button>
        </div>
      )}
      
      {/* Combined Result Summary */}
      {combinedData.length > 0 && (
        <div className="results-summary">
          <h3>Combined Results</h3>
          <p><strong>Total menu items extracted:</strong> {getTotalMenuItems()}</p>
          <p><strong>Images processed:</strong> {combinedData.length}</p>
          
          {/* Image Generation Button Section */}
          <div className="image-generation-section">
            <div className="image-button-group">
              <button 
                onClick={handleGenerateImages} 
                disabled={imageGenerationLoading || partialImageLoading || getTotalMenuItems() === 0}
                className="generate-images-button"
              >
                {imageGenerationLoading 
                  ? `Generating Images... (${imageProcessedCount}/${getTotalMenuItems()})` 
                  : hasGeneratedImages()
                    ? "Regenerate All Dish Images"
                    : "Generate Images for All Dishes"}
              </button>
              
              <button 
                onClick={handlePartialImageGeneration} 
                disabled={imageGenerationLoading || partialImageLoading || getTotalMenuItems() === 0}
                className="generate-images-button partial"
              >
                {partialImageLoading 
                  ? `Generating Partial Images... (${imageProcessedCount}/${getTotalMenuItems()})` 
                  : "Partially Generate Images"}
              </button>
            </div>
            
            {(imageGenerationLoading || partialImageLoading) && (
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${Math.round((imageProcessedCount / getTotalMenuItems()) * 100)}%` }}
                ></div>
                <div className="progress-text">
                  {Math.round((imageProcessedCount / getTotalMenuItems()) * 100)}%
                </div>
              </div>
            )}
            
            {/* Image generation stats */}
            {hasGeneratedImages() && (
              <div className="image-stats">
                <p>
                  <strong>Items with generated images:</strong> {getItemsWithImages()} of {getTotalMenuItems()} 
                  ({Math.round((getItemsWithImages() / getTotalMenuItems()) * 100)}%)
                </p>
              </div>
            )}
          </div>
          
          <div className="json-preview">
            <pre className="json-content">
              {JSON.stringify(
                combinedData
                  .filter(result => !result.error && result.data)
                  .flatMap(result => result.data),
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
                      <pre className="raw-response">{result.error.rawResponse}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p>
                    <strong>Items extracted:</strong> {result.data.length}
                    {result.note && <span className="item-count"> ({result.note})</span>}
                    {result.data.some(item => item.image) && (
                      <span className="item-count"> - {result.data.filter(item => item.image).length} items with images</span>
                    )}
                  </p>
                  {result.data.length === 0 ? (
                    <p className="error-text">No menu items could be extracted from this image.</p>
                  ) : (
                    <div className="data-preview">
                      <pre className="json-content">{JSON.stringify(result.data, null, 2)}</pre>
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


