/**
 * Calculate age from date of birth
 * @param dob - Date of birth string (format: YYYY-MM-DD or any valid date string)
 * @returns Age in years as a number
 */
export const calculateAgeFromDOB = (dob: string): number => {
  if (!dob) return 0;

  try {
    const birthDate = new Date(dob);
    const today = new Date();

    // Check if the date is valid
    if (isNaN(birthDate.getTime())) {
      return 0;
    }

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    // If birthday hasn't occurred this year, subtract 1 from age
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return Math.max(0, age); // Ensure age is not negative
  } catch (error) {
    return 0;
  }
};

/**
 * Calculate date of birth in YYYY-MM-DD format from age
 * @param age - Age in years as a number
 * @returns Date of birth string in YYYY-MM-DD format
 */
export const calculateDOBFromAge = (age: number): string => {
  if (age < 0 || !Number.isInteger(age)) {
    return '';
  }

  try {
    const today = new Date();
    const birthYear = today.getFullYear() - age;
    const birthMonth = today.getMonth();
    const birthDay = today.getDate();

    const birthDate = new Date(birthYear, birthMonth, birthDay);

    // Format as YYYY-MM-DD
    const year = birthDate.getFullYear();
    const month = String(birthDate.getMonth() + 1).padStart(2, '0');
    const day = String(birthDate.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    return '';
  }
};
