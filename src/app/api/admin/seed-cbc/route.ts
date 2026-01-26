import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST /api/admin/seed-cbc - Seed CBC curriculum data
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Get CBC curriculum ID
        const { data: cbcCurriculum, error: currError } = await supabase
            .from('curriculums')
            .select('id')
            .eq('name', 'CBC')
            .single();

        if (currError || !cbcCurriculum) {
            return NextResponse.json({ error: 'CBC curriculum not found. Please create it first.' }, { status: 404 });
        }

        const cbcId = cbcCurriculum.id;

        // Define CBC subjects (unique names)
        const cbcSubjects = [
            { name: 'Indigenous Language', description: 'Local/Mother tongue languages - Lower Primary' },
            { name: 'Kiswahili', description: 'Kiswahili Language' },
            { name: 'English', description: 'English Language' },
            { name: 'Mathematics', description: 'Mathematics and Numeracy' },
            { name: 'Religious Education (CRE)', description: 'Christian Religious Education' },
            { name: 'Religious Education (IRE)', description: 'Islamic Religious Education' },
            { name: 'Religious Education (HRE)', description: 'Hindu Religious Education' },
            { name: 'Environmental Activities', description: 'Includes Hygiene and Nutrition - Lower Primary' },
            { name: 'Creative Activities', description: 'Arts, Crafts, Music - Lower Primary' },
            { name: 'Science and Technology', description: 'Science and Technology - Upper Primary' },
            { name: 'Social Studies', description: 'Social Studies and Citizenship' },
            { name: 'Agriculture and Nutrition', description: 'Agriculture + Home Science merged - Upper Primary' },
            { name: 'Creative Arts', description: 'Visual Arts, Music, PHE merged' },
            { name: 'Kenyan Sign Language', description: 'Alternative to Kiswahili for hearing-impaired' },
            { name: 'Life Skills Education', description: 'Merged with Social Studies - Junior School' },
            { name: 'Integrated Science', description: 'Science + Health Education merged - Junior School' },
            { name: 'Health Education', description: 'Health and Hygiene studies' },
            { name: 'Pre-Technical Studies', description: 'Pre-Technical/Business/Computer Studies - Junior School' },
            { name: 'Business Studies', description: 'Business and Entrepreneurship' },
            { name: 'Computer Studies', description: 'ICT and Computing' },
            { name: 'Sports and Physical Education', description: 'PE and Sports - Junior School' },
        ];

        // Upsert subjects (insert if not exists)
        for (const subject of cbcSubjects) {
            await supabase
                .from('subjects')
                .upsert({ name: subject.name, description: subject.description }, { onConflict: 'name' });
        }

        // Define CBC grades
        const cbcGrades = [
            { name: 'Grade 1', level_order: 1 },
            { name: 'Grade 2', level_order: 2 },
            { name: 'Grade 3', level_order: 3 },
            { name: 'Grade 4', level_order: 4 },
            { name: 'Grade 5', level_order: 5 },
            { name: 'Grade 6', level_order: 6 },
            { name: 'Grade 7', level_order: 7 },
            { name: 'Grade 8', level_order: 8 },
            { name: 'Grade 9', level_order: 9 },
        ];

        // Insert grades (upsert)
        const insertedGrades: { [key: string]: string } = {};
        for (const grade of cbcGrades) {
            const { data, error } = await supabase
                .from('grades')
                .upsert({
                    curriculum_id: cbcId,
                    name: grade.name,
                    level_order: grade.level_order
                }, { onConflict: 'curriculum_id,name' })
                .select('id, name')
                .single();

            if (data) {
                insertedGrades[grade.name] = data.id;
            }
        }

        // Get all subject IDs
        const { data: allSubjects } = await supabase.from('subjects').select('id, name');
        const subjectIds: { [key: string]: string } = {};
        allSubjects?.forEach(s => { subjectIds[s.name] = s.id; });

        // Define grade-subject mappings
        const gradeSubjectMappings: { [key: string]: string[] } = {
            // Lower Primary (Grades 1-3)
            'Grade 1': ['Indigenous Language', 'Kiswahili', 'English', 'Mathematics', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Environmental Activities', 'Creative Activities'],
            'Grade 2': ['Indigenous Language', 'Kiswahili', 'English', 'Mathematics', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Environmental Activities', 'Creative Activities'],
            'Grade 3': ['Indigenous Language', 'Kiswahili', 'English', 'Mathematics', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Environmental Activities', 'Creative Activities'],

            // Upper Primary (Grades 4-6)
            'Grade 4': ['English', 'Kiswahili', 'Mathematics', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Science and Technology', 'Social Studies', 'Agriculture and Nutrition', 'Creative Arts'],
            'Grade 5': ['English', 'Kiswahili', 'Mathematics', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Science and Technology', 'Social Studies', 'Agriculture and Nutrition', 'Creative Arts'],
            'Grade 6': ['English', 'Kiswahili', 'Mathematics', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Science and Technology', 'Social Studies', 'Agriculture and Nutrition', 'Creative Arts'],

            // Junior School (Grades 7-9)
            'Grade 7': ['English', 'Kiswahili', 'Kenyan Sign Language', 'Mathematics', 'Social Studies', 'Life Skills Education', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Integrated Science', 'Health Education', 'Agriculture and Nutrition', 'Pre-Technical Studies', 'Business Studies', 'Computer Studies', 'Creative Arts', 'Sports and Physical Education'],
            'Grade 8': ['English', 'Kiswahili', 'Kenyan Sign Language', 'Mathematics', 'Social Studies', 'Life Skills Education', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Integrated Science', 'Health Education', 'Agriculture and Nutrition', 'Pre-Technical Studies', 'Business Studies', 'Computer Studies', 'Creative Arts', 'Sports and Physical Education'],
            'Grade 9': ['English', 'Kiswahili', 'Kenyan Sign Language', 'Mathematics', 'Social Studies', 'Life Skills Education', 'Religious Education (CRE)', 'Religious Education (IRE)', 'Religious Education (HRE)', 'Integrated Science', 'Health Education', 'Agriculture and Nutrition', 'Pre-Technical Studies', 'Business Studies', 'Computer Studies', 'Creative Arts', 'Sports and Physical Education'],
        };

        // Insert grade-subject links
        let linksCreated = 0;
        for (const [gradeName, subjects] of Object.entries(gradeSubjectMappings)) {
            const gradeId = insertedGrades[gradeName];
            if (!gradeId) continue;

            for (const subjectName of subjects) {
                const subjectId = subjectIds[subjectName];
                if (!subjectId) continue;

                await supabase
                    .from('grade_subjects')
                    .upsert({ grade_id: gradeId, subject_id: subjectId }, { onConflict: 'grade_id,subject_id' });
                linksCreated++;
            }
        }

        return NextResponse.json({
            success: true,
            message: 'CBC data seeded successfully',
            stats: {
                subjects: cbcSubjects.length,
                grades: Object.keys(insertedGrades).length,
                gradeSubjectLinks: linksCreated,
            }
        });

    } catch (error: any) {
        console.error('Seed CBC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
