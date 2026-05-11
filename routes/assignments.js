const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// setup multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// GET /api/assignments/:courseId - get all assignments for a course
router.get('/:courseId', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('course_id', sql.Int, req.params.courseId)
            .query('SELECT * FROM assignments WHERE course_id = @course_id ORDER BY created_at DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/assignments/:courseId - professor creates assignment
router.post('/:courseId', auth, upload.single('file'), async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can create assignments' });
    }

    const { title, description, due_date } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const file_url = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('course_id', sql.Int, req.params.courseId)
            .input('title', sql.NVarChar, title)
            .input('description', sql.NVarChar, description || '')
            .input('file_url', sql.NVarChar, file_url)
            .input('due_date', sql.DateTime, due_date || null)
            .query('INSERT INTO assignments (course_id, title, description, file_url, due_date) VALUES (@course_id, @title, @description, @file_url, @due_date)');

        res.status(201).json({ message: 'Assignment created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/assignments/submit/:assignmentId - student submits
router.post('/submit/:assignmentId', auth, upload.single('file'), async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can submit' });
    }

    const { text_response } = req.body;
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!text_response && !file_url) {
        return res.status(400).json({ message: 'Please provide a text response or a file' });
    }

    try {
        const pool = await poolPromise;

        // check already submitted
        const existing = await pool.request()
            .input('assignment_id', sql.Int, req.params.assignmentId)
            .input('student_id', sql.Int, req.user.id)
            .query('SELECT id FROM submissions WHERE assignment_id = @assignment_id AND student_id = @student_id');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ message: 'Already submitted' });
        }

        await pool.request()
            .input('assignment_id', sql.Int, req.params.assignmentId)
            .input('student_id', sql.Int, req.user.id)
            .input('text_response', sql.NVarChar, text_response || null)
            .input('file_url', sql.NVarChar, file_url)
            .query('INSERT INTO submissions (assignment_id, student_id, text_response, file_url) VALUES (@assignment_id, @student_id, @text_response, @file_url)');

        res.status(201).json({ message: 'Submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/assignments/submissions/:assignmentId - professor sees all submissions
router.get('/submissions/:assignmentId', auth, async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can view submissions' });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('assignment_id', sql.Int, req.params.assignmentId)
            .query(`
                SELECT s.*, u.name AS student_name, u.email AS student_email
                FROM submissions s
                JOIN users u ON s.student_id = u.id
                WHERE s.assignment_id = @assignment_id
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;