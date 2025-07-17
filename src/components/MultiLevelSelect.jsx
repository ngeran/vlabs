import React, { useState, useEffect, useCallback } from 'react';

// =================================================================================================
// CREATIVE ICON LIBRARY
// =================================================================================================

const IconLibrary = {
  Server: ({ className = "w-4 h-4", animated = false }) => (
    <svg className={`${className} ${animated ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),

  Layers: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),

  Cpu: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),

  Photo: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),

  ChevronDown: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),

  ChevronRight: ({ className = "w-3 h-3" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),

  Check: ({ className = "w-3 h-3" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),

  X: ({ className = "w-3 h-3" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
};

// =================================================================================================
// VERTICAL PROGRESS INDICATOR
// =================================================================================================

const VerticalProgress = ({ steps, currentStep, onStepClick }) => {
  const stepConfig = [
    { key: 'vendor', label: 'Vendor', icon: IconLibrary.Server, color: 'gray' },
    { key: 'category', label: 'Category', icon: IconLibrary.Layers, color: 'slate' },
    { key: 'platform', label: 'Platform', icon: IconLibrary.Cpu, color: 'zinc' },
    { key: 'image', label: 'Image', icon: IconLibrary.Photo, color: 'stone' }
  ];

  return (
    <div className="flex items-center justify-center gap-1 mb-4 px-2">
      {stepConfig.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isAccessible = index <= currentStep;
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center">
            <button
              onClick={() => isAccessible && onStepClick(index)}
              disabled={!isAccessible}
              className={`
                relative flex items-center justify-center w-8 h-8 rounded-full
                transition-all duration-200 text-xs
                ${isCompleted
                  ? 'bg-gray-600 text-white'
                  : isCurrent
                    ? `bg-${step.color}-100 text-${step.color}-700 ring-1 ring-${step.color}-400`
                    : 'bg-gray-200 text-gray-400'
                }
                ${isAccessible ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed'}
              `}
            >
              {isCompleted ? (
                <IconLibrary.Check className="w-3 h-3" />
              ) : (
                <Icon className="w-3 h-3" />
              )}
            </button>

            {/* Connector line */}
            {index < stepConfig.length - 1 && (
              <div className={`w-4 h-0.5 mx-1 ${index < currentStep ? 'bg-gray-500' : 'bg-gray-300'}`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// =================================================================================================
// COMPACT OPTION ITEM
// =================================================================================================

const CompactOptionItem = ({ option, isSelected, onSelect, color = 'blue' }) => {
  return (
    <button
      onClick={() => onSelect(option.name)}
      className={`
        w-full text-left p-2 rounded-lg border transition-all duration-200
        ${isSelected
          ? `border-${color}-400 bg-${color}-50 text-${color}-900`
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }
        group flex items-center justify-between
      `}
    >
      <span className="text-sm font-medium truncate pr-2">{option.name}</span>
      {isSelected && (
        <div className={`w-4 h-4 bg-${color}-500 rounded-full flex items-center justify-center flex-shrink-0`}>
          <IconLibrary.Check className="w-2 h-2 text-white" />
        </div>
      )}
    </button>
  );
};

// =================================================================================================
// COLLAPSIBLE SECTION
// =================================================================================================

const CollapsibleSection = ({ title, icon: Icon, isOpen, onToggle, children, color = 'blue', hasSelection = false }) => {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={`
          w-full px-3 py-2 flex items-center justify-between transition-colors
          ${isOpen
            ? `bg-${color}-50 border-b border-${color}-200`
            : hasSelection
              ? `bg-${color}-50`
              : 'bg-gray-50 hover:bg-gray-100'
          }
        `}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${hasSelection ? `text-${color}-600` : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${hasSelection ? `text-${color}-900` : 'text-gray-700'}`}>
            {title}
          </span>
          {hasSelection && (
            <div className={`w-2 h-2 bg-${color}-500 rounded-full`}></div>
          )}
        </div>
        <IconLibrary.ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ${hasSelection ? `text-${color}-600` : 'text-gray-400'}`}
        />
      </button>

      {isOpen && (
        <div className="p-3 bg-white animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

// =================================================================================================
// MAIN SIDEBAR COMPONENT
// =================================================================================================

const SidebarMultiLevelSelect = ({ parameters = {}, onParamChange }) => {
  // State management
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [openSections, setOpenSections] = useState({
    vendor: true,
    category: false,
    platform: false,
    image: false
  });

  // Derive selections from parameters
  const imagePath = parameters.image_path || '';
  const [vendor, category, platform, image] = imagePath.split('/');

  // Step colors - different shades of gray
  const stepColors = ['gray', 'slate', 'zinc', 'stone'];

  // =================================================================================================
  // DATA FETCHING
  // =================================================================================================

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('http://localhost:3001/api/inventory-tree');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonData = await response.json();
        setData(jsonData);

      } catch (err) {
        setError(err.message);
        console.error('Failed to fetch inventory data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Data processing
  const getFolders = (items) => items?.filter(item => item.type === 'folder') || [];
  const getFiles = (items) => items?.filter(item => item.type === 'file') || [];

  const vendorOptions = getFolders(data?.children || []);
  const categoryOptions = vendor ? getFolders(vendorOptions.find(v => v.name === vendor)?.children || []) : [];
  const platformOptions = category ? getFolders(categoryOptions.find(c => c.name === category)?.children || []) : [];
  const imageOptions = platform ? getFiles(platformOptions.find(p => p.name === platform)?.children || []) : [];

  // Selection handler
  const handleSelectionChange = useCallback((level, value) => {
    const levels = ['vendor', 'category', 'platform', 'image'];
    const currentPathParts = imagePath.split('/');
    const levelIndex = levels.indexOf(level);

    // Build new path
    let newPath = '';
    for (let i = 0; i <= levelIndex; i++) {
      const part = i === levelIndex ? value : currentPathParts[i];
      newPath += (i === 0 ? '' : '/') + part;
    }

    // Update parent state
    onParamChange('image_path', newPath);

    // Update current step and open next section
    setCurrentStep(levelIndex + 1);

    // Auto-open next section
    const nextLevel = levels[levelIndex + 1];
    if (nextLevel) {
      setOpenSections(prev => ({
        ...prev,
        [nextLevel]: true
      }));
    }
  }, [imagePath, onParamChange]);

  // Toggle section
  const toggleSection = (section) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Clear selection
  const clearSelection = () => {
    onParamChange('image_path', '');
    setCurrentStep(0);
    setOpenSections({
      vendor: true,
      category: false,
      platform: false,
      image: false
    });
  };

  // =================================================================================================
  // LOADING STATE
  // =================================================================================================

  if (loading) {
    return (
      <div className="w-full max-w-[270px] p-4 bg-white">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Image Selection</h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">Loading inventory...</p>
          </div>
        </div>
      </div>
    );
  }

  // =================================================================================================
  // ERROR STATE
  // =================================================================================================

  if (error) {
    return (
      <div className="w-full max-w-[270px] p-4 bg-white">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Image Selection</h3>
        </div>
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-sm font-medium text-red-800">Error Loading Data</span>
          </div>
          <p className="text-xs text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[270px] p-4 bg-white">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Image Selection</h3>
        <VerticalProgress
          steps={[vendor, category, platform, image]}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
        />
      </div>

      {/* Selection sections */}
      <div className="space-y-3">
        {/* Vendor Selection */}
        <CollapsibleSection
          title="Vendor"
          icon={IconLibrary.Server}
          isOpen={openSections.vendor}
          onToggle={() => toggleSection('vendor')}
          color={stepColors[0]}
          hasSelection={!!vendor}
        >
          <div className="space-y-2">
            {vendorOptions.map((option) => (
              <CompactOptionItem
                key={option.name}
                option={option}
                isSelected={vendor === option.name}
                onSelect={(value) => handleSelectionChange('vendor', value)}
                color={stepColors[0]}
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* Category Selection */}
        {vendor && (
          <CollapsibleSection
            title="Category"
            icon={IconLibrary.Layers}
            isOpen={openSections.category}
            onToggle={() => toggleSection('category')}
            color={stepColors[1]}
            hasSelection={!!category}
          >
            <div className="space-y-2">
              {categoryOptions.map((option) => (
                <CompactOptionItem
                  key={option.name}
                  option={option}
                  isSelected={category === option.name}
                  onSelect={(value) => handleSelectionChange('category', value)}
                  color={stepColors[1]}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Platform Selection */}
        {category && (
          <CollapsibleSection
            title="Platform"
            icon={IconLibrary.Cpu}
            isOpen={openSections.platform}
            onToggle={() => toggleSection('platform')}
            color={stepColors[2]}
            hasSelection={!!platform}
          >
            <div className="space-y-2">
              {platformOptions.map((option) => (
                <CompactOptionItem
                  key={option.name}
                  option={option}
                  isSelected={platform === option.name}
                  onSelect={(value) => handleSelectionChange('platform', value)}
                  color={stepColors[2]}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Image Selection */}
        {platform && (
          <CollapsibleSection
            title="Image"
            icon={IconLibrary.Photo}
            isOpen={openSections.image}
            onToggle={() => toggleSection('image')}
            color={stepColors[3]}
            hasSelection={!!image}
          >
            <div className="space-y-2">
              {imageOptions.map((option) => (
                <CompactOptionItem
                  key={option.name}
                  option={option}
                  isSelected={image === option.name}
                  onSelect={(value) => handleSelectionChange('image', value)}
                  color={stepColors[3]}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Current Selection Summary */}
      {imagePath && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-800">Selected Path</span>
            <button
              onClick={clearSelection}
              className="text-gray-600 hover:text-gray-800 transition-colors"
            >
              <IconLibrary.X className="w-3 h-3" />
            </button>
          </div>
          <div className="bg-white/80 rounded p-2 border border-gray-200">
            <code className="text-xs font-mono text-gray-700 break-all">
              {imagePath}
            </code>
          </div>
        </div>
      )}

      {/* Custom CSS */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default SidebarMultiLevelSelect;
