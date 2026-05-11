const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/courses - public, anyone can see all courses (for homepage)
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT c.id, c.title, c.description, c.created_at,
                       u.name AS professor_name
                FROM courses c
                JOIN users u ON c.professor_id = u.id
                ORDER BY c.created_at DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/courses - only professors can create a course
router.post('/', auth, async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can create courses' });
    }

    const { title, description } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('professor_id', sql.Int, req.user.id)
            .input('title', sql.NVarChar, title)
            .input('description', sql.NVarChar, description || '')
            .query('INSERT INTO courses (professor_id, title, description) VALUES (@professor_id, @title, @description)');

        res.status(201).json({ message: 'Course created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/courses/:id - professor updates their course
router.put('/:id', auth, async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can update courses' });
    }

    const { title, description } = req.body;

    try {
        const pool = await poolPromise;

        // make sure this course belongs to this professor
        const check = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('professor_id', sql.Int, req.user.id)
            .query('SELECT id FROM courses WHERE id = @id AND professor_id = @professor_id');

        if (check.recordset.length === 0) {
            return res.status(403).json({ message: 'Course not found or not yours' });
        }

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('title', sql.NVarChar, title)
            .input('description', sql.NVarChar, description || '')
            .query('UPDATE courses SET title = @title, description = @description WHERE id = @id');

        res.json({ message: 'Course updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// DELETE /api/courses/:id - professor deletes their course
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role !== 'professor') {
        return res.status(403).json({ message: 'Only professors can delete courses' });
    }

    try {
        const pool = await poolPromise;

        const check = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('professor_id', sql.Int, req.user.id)
            .query('SELECT id FROM courses WHERE id = @id AND professor_id = @professor_id');

        if (check.recordset.length === 0) {
            return res.status(403).json({ message: 'Course not found or not yours' });
        }

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM courses WHERE id = @id');

        res.json({ message: 'Course deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;