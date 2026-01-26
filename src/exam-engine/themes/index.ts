export interface ExamTheme {
    id: string;
    name: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    margin: number; // in mm
    showTeacherUse: boolean;
    showMarks: boolean;
    styles: {
        headerWeight: "normal" | "bold" | "bolder";
        dividerStyle: "none" | "solid" | "dashed" | "soft";
        questionSpacing: string;
    };
}

export const classicInternationalTheme: ExamTheme = {
    id: "classic-international",
    name: "Classic International",
    fontFamily: "Times New Roman, serif",
    fontSize: 12,
    lineHeight: 1.4,
    margin: 20,
    showTeacherUse: true,
    showMarks: true,
    styles: {
        headerWeight: "normal",
        dividerStyle: "none",
        questionSpacing: "1.5em",
    },
};

export const modernAssessmentTheme: ExamTheme = {
    id: "modern-assessment",
    name: "Modern Assessment",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    lineHeight: 1.6,
    margin: 24,
    showTeacherUse: false,
    showMarks: true,
    styles: {
        headerWeight: "bold",
        dividerStyle: "soft",
        questionSpacing: "2em",
    },
};

export const nationalStandardTheme: ExamTheme = {
    id: "national-standard",
    name: "National Standard",
    fontFamily: "Arial, sans-serif",
    fontSize: 12,
    lineHeight: 1.5,
    margin: 22,
    showTeacherUse: true,
    showMarks: true,
    styles: {
        headerWeight: "bolder",
        dividerStyle: "solid",
        questionSpacing: "1.8em",
    },
};

export const primaryCompetencyTheme: ExamTheme = {
    id: "primary-competency",
    name: "Primary Competency",
    fontFamily: "Poppins, sans-serif",
    fontSize: 15,
    lineHeight: 1.8,
    margin: 26,
    showTeacherUse: false,
    showMarks: false,
    styles: {
        headerWeight: "bold",
        dividerStyle: "dashed",
        questionSpacing: "3em",
    },
};

export const themes = [
    classicInternationalTheme,
    modernAssessmentTheme,
    nationalStandardTheme,
    primaryCompetencyTheme,
];
