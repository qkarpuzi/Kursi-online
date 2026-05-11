const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/enrollments/questions - get the global questions (student sees these when applying)
router.get('/questions', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM enrollment_questions ORDER BY display_order');
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/enrollments/apply/:courseId - student applies to a course
router.post('/apply/:courseId', auth, async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can apply' });
    }

    const { answers } = req.body;
    // answers should be an array like:
    // [{ question_id: 1, selected_option: 'a' }, ...]

    if (!answers || answers.length === 0) {
        return res.status(400).json({ message: 'Answers are required' });
    }

    try {
        const pool = await poolPromise;

        // check if already applied
        const existing = await pool.request()
            .input('student_id', sql.Int, req.user.id)
            .input('course_id', sql.Int, req.params.courseId)
            .query('SELECT id FROM enrollment_applications WHERE student_id = @student_id AND course_id = @course_id');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ message: 'Already applied to this course' });
        }

        // create the application
        const appResult = await pool.request()
            .input('student_id', sql.Int, req.user.id)
            .input('course_id', sql.Int, req.params.courseId)
            .query(`
                INSERT INTO enrollment_applications (student_id, course_id)
                OUTPUT INSERTED.id
                VALUES (@student_id, @course_id)
            `);

        const applicationId = appResult.recordset[0].id;

        // save each answer
        for (const answer of answers) {
            await pool.request()
                .input('application_id', sql.Int, applicationId)
                .input('question_id', sql.Int, answer.question_id)
                .input('selected_option', sql.NVarChar, answer.selected_option)
                .query('INSERT INTO enrollment_answers (application_id, question_id, selected_option) VALUES (@application_id, @question_id, @selected_option)');
        }

        res.status(201).json({ message: 'Application submitted successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/enrollments/applications/:courseId - professor sees all applications for a course
router.get('/applications/:courseId', auth, async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can view applications' });
    }

    try {
        const pool = await poolPromise;

        // verify this course belongs to this professor
        const check = await pool.request()
            .input('id', sql.Int, req.params.courseId)
            .input('professor_id', sql.Int, req.user.id)
            .query('SELECT id FROM courses WHERE id = @id AND professor_id = @professor_id');

        if (check.recordset.length === 0) {
            return res.status(403).json({ message: 'Course not found or not yours' });
        }

        // get all applications with student name and their answers
        const applications = await pool.request()
            .input('course_id', sql.Int, req.params.courseId)
            .query(`
                SELECT 
                    ea.id AS application_id,
                    ea.status,
                    ea.applied_at,
                    u.id AS student_id,
                    u.name AS student_name,
                    u.email AS student_email
                FROM enrollment_applications ea
                JOIN users u ON ea.student_id = u.id
                WHERE ea.course_id = @course_id
                ORDER BY ea.applied_at DESC
            `);

        // for each application, get their answers
        for (const app of applications.recordset) {
            const answers = await pool.request()
                .input('application_id', sql.Int, app.application_id)
                .query(`
                    SELECT eq.question_text, ena.selected_option,
                           CASE ena.selected_option
                               WHEN 'a' THEN eq.option_a
                               WHEN 'b' THEN eq.option_b
                               WHEN 'c' THEN eq.option_c
                               WHEN 'd' THEN eq.option_d
                           END AS answer_text
                    FROM enrollment_answers ena
                    JOIN enrollment_questions eq ON ena.question_id = eq.id
                    WHERE ena.application_id = @application_id
                `);
            app.answers = answers.recordset;
        }

        res.json(applications.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/enrollments/review/:applicationId - professor accepts or rejects
router.put('/review/:applicationId', auth, async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can review applications' });
    }

    const { status } = req.body; // 'accepted' or 'rejected'

    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Status must be accepted or rejected' });
    }

    try {
        const pool = await poolPromise;

        // make sure this application belongs to a course owned by this professor
        const check = await pool.request()
            .input('application_id', sql.Int, req.params.applicationId)
            .input('professor_id', sql.Int, req.user.id)
            .query(`
                SELECT ea.id FROM enrollment_applications ea
                JOIN courses c ON ea.course_id = c.id
                WHERE ea.id = @application_id AND c.professor_id = @professor_id
            `);

        if (check.recordset.length === 0) {
            return res.status(403).json({ message: 'Application not found or not yours' });
        }

        await pool.request()
            .input('status', sql.NVarChar, status)
            .input('application_id', sql.Int, req.params.applicationId)
            .query('UPDATE enrollment_applications SET status = @status WHERE id = @application_id');

        res.json({ message: `Application ${status} successfully` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/enrollments/mycourses - student sees courses they were accepted to
router.get('/mycourses', auth, async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can view their courses' });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('student_id', sql.Int, req.user.id)
            .query(`
                SELECT c.id, c.title, c.description, c.created_at,
                       u.name AS professor_name,
                       ea.status
                FROM enrollment_applications ea
                JOIN courses c ON ea.course_id = c.id
                JOIN users u ON c.professor_id = u.id
                WHERE ea.student_id = @student_id AND ea.status = 'accepted'
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;