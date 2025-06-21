const getDifficultyColor = (difficulty) => {
  if (!difficulty) return 'bg-gray-300 text-gray-700'; // fallback color
  switch (difficulty.toLowerCase()) {
    case 'beginner':
      return 'bg-green-100 text-green-800';
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-800';
    case 'advanced':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-300 text-gray-700';
  }
};

export default getDifficultyColor;
