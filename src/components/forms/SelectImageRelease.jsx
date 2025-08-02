import React, { useState, useEffect, useCallback } from 'react';

// =================================================================================================
// ICON LIBRARY
// A local icon library for UI elements.
// =================================================================================================

const IconLibrary = {
  Server: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  Layers: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  CodeBracket: ({ className = "w-4 h-4" }) => (
     <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
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

const CollapsibleSection = ({ title, icon: Icon, isOpen, onToggle, children, color = 'blue', hasSelection = false }) => (
  <div className="border border-gray-200 rounded-lg overflow-hidden">
    <button onClick={onToggle} className={`w-full px-3 py-2 flex items-center justify-between transition-colors ${isOpen ? `bg-${color}-50 border-b border-${color}-200` : hasSelection ? `bg-${color}-50` : 'bg-gray-50 hover:bg-gray-100'}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${hasSelection ? `text-${color}-600` : 'text-gray-500'}`} />
        <span className={`text-sm font-medium ${hasSelection ? `text-${color}-900` : 'text-gray-700'}`}>{title}</span>
        {hasSelection && <div className={`w-2 h-2 bg-${color}-500 rounded-full`}></div>}
      </div>
      <IconLibrary.ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ${hasSelection ? `text-${color}-600` : 'text-gray-400'}`} />
    </button>
    {isOpen && <div className="p-3 bg-white animate-fade-in">{children}</div>}
  </div>
);

const OptionItem = ({ option, isSelected, onSelect, color = 'blue' }) => (
  <button onClick={() => onSelect(option.name)} className={`w-full text-left p-2 rounded-lg border transition-all duration-200 ${isSelected ? `border-${color}-400 bg-${color}-50 text-${color}-900` : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'} group flex items-center justify-between`}>
    <span className="text-sm font-medium truncate pr-2">{option.name}</span>
    {isSelected && <div className={`w-4 h-4 bg-${color}-500 rounded-full flex items-center justify-center flex-shrink-0`}><IconLibrary.Check className="w-2 h-2 text-white" /></div>}
  </button>
);

const SelectImageRelease = ({ parameters = {}, onParamChange }) => {
  const [inventory, setInventory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedVendor, setSelectedVendor] = useState(parameters.vendor || '');
  const [selectedPlatform, setSelectedPlatform] = useState(parameters.platform || '');
  const [selectedRelease, setSelectedRelease] = useState(parameters.target_version || '');
  const [selectedImage, setSelectedImage] = useState(parameters.image_filename || '');

  const [openSections, setOpenSections] = useState({ vendor: true, platform: false, release: false, image: false });

  useEffect(() => {
    const fetchSoftwareVersions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('http://localhost:3001/api/inventories/software-versions');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setInventory(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSoftwareVersions();
  }, []);

  const vendorOptions = inventory?.vendors || [];
  const platformOptions = vendorOptions.find(v => v.name === selectedVendor)?.platforms || [];
  const releaseOptions = platformOptions.find(p => p.name === selectedPlatform)?.releases || [];
  const imageOptions = releaseOptions.find(r => r.version === selectedRelease)?.images || [];

  const handleSelection = useCallback((setter, paramName, value, nextSection) => {
    setter(value);
    onParamChange(paramName, value);
    if (nextSection) {
      setOpenSections(prev => ({ ...prev, [nextSection]: true }));
    }
  }, [onParamChange]);

  const handleVendorSelect = (name) => {
    handleSelection(setSelectedVendor, 'vendor', name, 'platform');
    setSelectedPlatform(''); onParamChange('platform', '');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handlePlatformSelect = (name) => {
    handleSelection(setSelectedPlatform, 'platform', name, 'release');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handleReleaseSelect = (version) => {
    handleSelection(setSelectedRelease, 'target_version', version, 'image');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handleImageSelect = (file) => {
    // ** THIS IS THE CHANGE **
    // The parameter is now named `image_filename` for clarity.
    handleSelection(setSelectedImage, 'image_filename', file, null);
  };

  const clearSelection = () => {
    setSelectedVendor(''); onParamChange('vendor', '');
    setSelectedPlatform(''); onParamChange('platform', '');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
    setOpenSections({ vendor: true, platform: false, release: false, image: false });
  };

  if (isLoading) return <p className="text-slate-500">Loading software inventory...</p>;
  if (error) return <p className="text-red-500">Error: {error}</p>;

  return (
    <div className="w-full space-y-3">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Image Selection</h3>

      <CollapsibleSection title="Vendor" icon={IconLibrary.Server} isOpen={openSections.vendor} onToggle={() => setOpenSections(s => ({...s, vendor: !s.vendor}))} color="gray" hasSelection={!!selectedVendor}>
        <div className="space-y-2">
          {vendorOptions.map(v => <OptionItem key={v.name} option={v} isSelected={selectedVendor === v.name} onSelect={() => handleVendorSelect(v.name)} color="gray" />)}
        </div>
      </CollapsibleSection>

      {selectedVendor && (
        <CollapsibleSection title="Platform" icon={IconLibrary.Layers} isOpen={openSections.platform} onToggle={() => setOpenSections(s => ({...s, platform: !s.platform}))} color="slate" hasSelection={!!selectedPlatform}>
          <div className="space-y-2">
            {platformOptions.map(p => <OptionItem key={p.name} option={p} isSelected={selectedPlatform === p.name} onSelect={() => handlePlatformSelect(p.name)} color="slate" />)}
          </div>
        </CollapsibleSection>
      )}

      {selectedPlatform && (
        <CollapsibleSection title="Release" icon={IconLibrary.CodeBracket} isOpen={openSections.release} onToggle={() => setOpenSections(s => ({...s, release: !s.release}))} color="zinc" hasSelection={!!selectedRelease}>
          <div className="space-y-2">
            {releaseOptions.map(r => <OptionItem key={r.version} option={{name: r.version}} isSelected={selectedRelease === r.version} onSelect={() => handleReleaseSelect(r.version)} color="zinc" />)}
          </div>
        </CollapsibleSection>
      )}

      {selectedRelease && (
        <CollapsibleSection title="Image File" icon={IconLibrary.Photo} isOpen={openSections.image} onToggle={() => setOpenSections(s => ({...s, image: !s.image}))} color="stone" hasSelection={!!selectedImage}>
          <div className="space-y-2">
            {imageOptions.map(i => <OptionItem key={i.file} option={{name: i.file}} isSelected={selectedImage === i.file} onSelect={() => handleImageSelect(i.file)} color="stone" />)}
          </div>
        </CollapsibleSection>
      )}

      {selectedImage && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-800">Final Selection</span>
            <button onClick={clearSelection} className="text-gray-600 hover:text-gray-800 transition-colors"><IconLibrary.X className="w-3 h-3" /></button>
          </div>
          <div className="space-y-1 text-xs text-gray-700">
            <p><strong>Release:</strong> {selectedRelease}</p>
            <p><strong>Image:</strong> {selectedImage}</p>
          </div>
        </div>
      )}
       <style jsx>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default SelectImageRelease;
