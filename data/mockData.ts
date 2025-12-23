
import { Question } from '../types';

export const INITIAL_QUESTIONS: Question[] = [
  // --- IGCSE PHYSICS ---
  {
    id: 'phys-igcse-001',
    text: 'A car travels 300m in 20s. Calculate its average speed.',
    marks: 2,
    difficulty: 'Easy',
    topic: 'Kinematics',
    subtopic: 'Speed and Velocity',
    subject: 'Physics',
    curriculum: 'IGCSE',
    term: 'Mid Term 1',
    grade: 'Year 10',
    type: 'Structured',
    markingScheme: 'Formula: Speed = Distance / Time (1 mark)\nCalculation: 300 / 20 = 15 m/s (1 mark)',
    bloomsLevel: 'Application'
  },
  {
    id: 'phys-igcse-002',
    text: 'Explain, in terms of molecules, why the pressure of a gas increases when its temperature increases at constant volume.',
    marks: 4,
    difficulty: 'Medium',
    topic: 'Thermal Physics',
    subtopic: 'Kinetic Model',
    subject: 'Physics',
    curriculum: 'IGCSE',
    term: 'End of Term 1',
    grade: 'Year 11',
    type: 'Essay',
    markingScheme: '- Molecules gain kinetic energy / move faster (1)\n- Molecules hit the walls more frequently (1)\n- Molecules hit the walls with greater force/change of momentum (1)\n- Pressure = Force / Area, so pressure increases (1)',
    bloomsLevel: 'Understanding'
  },
  
  // --- CBC SCIENCE ---
  {
    id: 'sci-cbc-001',
    text: 'Which part of a plant is responsible for absorbing water and mineral salts?',
    marks: 1,
    difficulty: 'Easy',
    topic: 'Plants',
    subtopic: 'Roots',
    subject: 'Integrated Science',
    curriculum: 'CBC',
    term: 'Opener',
    grade: 'Grade 7',
    type: 'Multiple Choice',
    options: ['Leaves', 'Stem', 'Roots', 'Flowers'],
    markingScheme: 'Correct Answer: C (Roots)\nRoots have root hairs which increase surface area for absorption of water and minerals.',
    bloomsLevel: 'Knowledge'
  },
  {
    id: 'sci-cbc-002',
    text: 'Describe three ways in which we can conserve water at home.',
    marks: 3,
    difficulty: 'Easy',
    topic: 'Environment',
    subtopic: 'Conservation',
    subject: 'Integrated Science',
    curriculum: 'CBC',
    term: 'Mid Term 2',
    grade: 'Grade 6',
    type: 'Structured',
    markingScheme: 'Any 3 points (1 mark each):\n- Closing taps when not in use.\n- Using a bucket to wash cars instead of a hosepipe.\n- Repairing leaking taps.\n- Recycling water (e.g., using rinsing water to water plants).',
    bloomsLevel: 'Application'
  },

  // --- IGCSE MATH ---
  {
    id: 'math-igcse-001',
    text: 'Solve the equation: 2x + 5 = 13',
    marks: 2,
    difficulty: 'Easy',
    topic: 'Algebra',
    subtopic: 'Linear Equations',
    subject: 'Mathematics',
    curriculum: 'IGCSE',
    term: 'Opener',
    grade: 'Year 9',
    type: 'Structured',
    markingScheme: '2x = 8 (1 mark)\nx = 4 (1 mark)',
    bloomsLevel: 'Application'
  },
  {
    id: 'math-igcse-002',
    text: 'Find the inverse of the matrix A = [[2, 1], [4, 3]]',
    marks: 3,
    difficulty: 'Difficult',
    topic: 'Matrices',
    subtopic: 'Inverse Matrices',
    subject: 'Mathematics',
    curriculum: 'IGCSE',
    term: 'Mid Term 3',
    grade: 'Year 11',
    type: 'Structured',
    markingScheme: 'Determinant = (2*3) - (1*4) = 6 - 4 = 2 (1 mark)\nAdjugate matrix: swap diagonals, change signs -> [[3, -1], [-4, 2]] (1 mark)\nInverse = 1/2 * [[3, -1], [-4, 2]] = [[1.5, -0.5], [-2, 1]] (1 mark)',
    bloomsLevel: 'Analysis'
  },

  // --- CBC MATH ---
  {
    id: 'math-cbc-001',
    text: 'What is the place value of digit 5 in the number 456,789?',
    marks: 1,
    difficulty: 'Easy',
    topic: 'Numbers',
    subtopic: 'Place Value',
    subject: 'Mathematics',
    curriculum: 'CBC',
    term: 'Opener',
    grade: 'Grade 5',
    type: 'Multiple Choice',
    options: ['Thousands', 'Ten Thousands', 'Hundreds', 'Millions'],
    markingScheme: 'Correct Answer: B (Ten Thousands)',
    bloomsLevel: 'Knowledge'
  },

  // --- PEARSON BIOLOGY ---
  {
    id: 'bio-pearson-001',
    text: 'Compare and contrast mitosis and meiosis.',
    marks: 6,
    difficulty: 'Difficult',
    topic: 'Cell Division',
    subtopic: 'Reproduction',
    subject: 'Biology',
    curriculum: 'Pearson',
    term: 'End of Term 2',
    grade: 'Year 11',
    type: 'Essay',
    markingScheme: 'Differences (max 4 marks):\n- Mitosis produces 2 daughter cells, Meiosis produces 4.\n- Mitosis produces genetically identical cells, Meiosis produces genetically different cells.\n- Mitosis is for growth/repair, Meiosis is for gamete production.\n- Mitosis has 1 division, Meiosis has 2 divisions.\n\nSimilarities (max 2 marks):\n- Both involve DNA replication beforehand.\n- Both follow Prophase, Metaphase, Anaphase, Telophase.',
    bloomsLevel: 'Analysis'
  },
  {
    id: 'bio-pearson-002',
    text: 'Which enzyme breaks down starch into maltose?',
    marks: 1,
    difficulty: 'Medium',
    topic: 'Enzymes',
    subtopic: 'Digestion',
    subject: 'Biology',
    curriculum: 'Pearson',
    term: 'Mid Term 1',
    grade: 'Year 10',
    type: 'Multiple Choice',
    options: ['Pepsin', 'Amylase', 'Lipase', 'Protease'],
    markingScheme: 'Correct Answer: B (Amylase)',
    bloomsLevel: 'Knowledge'
  }
];
