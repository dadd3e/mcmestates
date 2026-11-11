import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Trash2, Star, Upload, AlertCircle, Loader2 } from 'lucide-react';

interface ImageUploaderProps {
  primaryPhotoURL: string;
  additionalPhotoURLs: string[];
  onChange: (primary: string, additionals: string[]) => void;
  maxFiles?: number;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  primaryPhotoURL,
  additionalPhotoURLs,
  onChange,
  maxFiles = 10,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to resize and compress image to Data URL (Base64 JPEG)
  const resizeAndCompress = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Target maximum dimensions
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get 2D context'));
            return;
          }

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Export as highly compressed JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = () => {
          reject(new Error('Failed to load image file.'));
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file.'));
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle files selection
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessing(true);
    setError(null);

    const validFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/')
    );

    if (validFiles.length === 0) {
      setError('Please upload image files only (PNG, JPG, WEBP, etc.).');
      setProcessing(false);
      return;
    }

    const loadedDataUrls: string[] = [];
    for (const file of validFiles) {
      try {
        const compressed = await resizeAndCompress(file);
        loadedDataUrls.push(compressed);
      } catch (err) {
        console.error('Error processing image:', err);
      }
    }

    if (loadedDataUrls.length === 0) {
      setError('Failed to process the uploaded image(s).');
      setProcessing(false);
      return;
    }

    // Determine new primary and additional lists
    let newPrimary = primaryPhotoURL;
    let newAdditionals = [...additionalPhotoURLs];

    // If there is currently no primary, or it's a default placeholder image,
    // make the first uploaded image primary.
    const isPlaceholder =
      !primaryPhotoURL ||
      primaryPhotoURL.includes('unsplash.com') ||
      primaryPhotoURL === '';

    if (isPlaceholder) {
      newPrimary = loadedDataUrls[0];
      newAdditionals = [...newAdditionals, ...loadedDataUrls.slice(1)];
    } else {
      newAdditionals = [...newAdditionals, ...loadedDataUrls];
    }

    // Limit to maxFiles
    const totalFiles = [newPrimary, ...newAdditionals].filter(Boolean);
    if (totalFiles.length > maxFiles) {
      setError(`Maximum limit is ${maxFiles} photos. Excess photos were truncated.`);
      const truncated = totalFiles.slice(0, maxFiles);
      newPrimary = truncated[0] || '';
      newAdditionals = truncated.slice(1);
    }

    onChange(newPrimary, newAdditionals);
    setProcessing(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input value so same files can be uploaded again if needed
    if (e.target) {
      e.target.value = '';
    }
  };

  // Set selected image as primary
  const setAsPrimary = (url: string) => {
    if (url === primaryPhotoURL) return;

    // Filter current primary into additional, filter target out of additional
    const currentPrimary = primaryPhotoURL;
    const nextAdditionals = additionalPhotoURLs.filter((item) => item !== url);

    if (currentPrimary && !currentPrimary.includes('unsplash.com')) {
      nextAdditionals.push(currentPrimary);
    }

    onChange(url, nextAdditionals);
  };

  // Remove image
  const removeImage = (url: string) => {
    if (url === primaryPhotoURL) {
      // Find new primary from additionals if available
      if (additionalPhotoURLs.length > 0) {
        const nextPrimary = additionalPhotoURLs[0];
        const nextAdditionals = additionalPhotoURLs.slice(1);
        onChange(nextPrimary, nextAdditionals);
      } else {
        // Reset to default/empty
        onChange('', []);
      }
    } else {
      const nextAdditionals = additionalPhotoURLs.filter((item) => item !== url);
      onChange(primaryPhotoURL, nextAdditionals);
    }
  };

  const allImages = [
    ...(primaryPhotoURL && !primaryPhotoURL.includes('unsplash.com') ? [primaryPhotoURL] : []),
    ...additionalPhotoURLs,
  ];

  return (
    <div id="image-uploader-wrapper" className="space-y-3">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Photos & Digital Assets ({allImages.length} / {maxFiles})
      </label>

      {/* Drag & Drop Area */}
      <div
        id="image-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 ${
          isDragging
            ? 'border-[#1A1A19] bg-[#FCFCFB]'
            : 'border-gray-300 hover:border-[#1A1A19] bg-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {processing ? (
          <div className="flex flex-col items-center space-y-2 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A1A19]" />
            <p className="text-xs font-medium">Resizing and processing images...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="p-2 bg-gray-50 rounded-full text-gray-400">
              <Camera className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">
                Drag & drop files here, or <span className="text-[#1A1A19] underline">browse</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Supports multiple JPG, PNG, WEBP. Automatically resized for fast loading.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Uploaded Images Grid */}
      {allImages.length > 0 && (
        <div id="uploaded-images-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
          {allImages.map((url, idx) => {
            const isPrimary = url === primaryPhotoURL;
            return (
              <div
                key={idx}
                className={`relative group rounded-md overflow-hidden aspect-square border ${
                  isPrimary ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-gray-200'
                }`}
              >
                <img
                  src={url}
                  alt={`Uploaded item ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover bg-gray-50"
                />

                {/* Primary Indicator Badge */}
                {isPrimary && (
                  <div className="absolute top-1.5 left-1.5 bg-amber-400 text-black font-semibold text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5 fill-black" />
                    Primary
                  </div>
                )}

                {/* Hover Action Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {!isPrimary && (
                    <button
                      type="button"
                      title="Set as Primary Image"
                      onClick={() => setAsPrimary(url)}
                      className="p-1.5 bg-white text-gray-700 hover:text-amber-600 rounded-full shadow hover:scale-105 transition-transform"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete Image"
                    onClick={() => removeImage(url)}
                    className="p-1.5 bg-white text-red-600 hover:bg-red-50 rounded-full shadow hover:scale-105 transition-transform"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
