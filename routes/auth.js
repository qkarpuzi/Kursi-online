const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');

// REGISTER
// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, password, role } = req.body;

    // basic validation
    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (!['professor', 'student'].includes(role)) {
        return res.status(400).json({ message: 'Role must be professor or student' });
    }

    try {
        const pool = await poolPromise;

        // check if email already exists
        const existing = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id FROM users WHERE email = @email');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // hash the password — never store plain text
        // 10 is the "salt rounds" — how many times it scrambles the password
        const password_hash = await bcrypt.hash(password, 10);

        await pool.request()
            .input('name', sql.NVarChar, name)
            .input('email', sql.NVarChar, email)
            .input('password_hash', sql.NVarChar, password_hash)
            .input('role', sql.NVarChar, role)
            .query('INSERT INTO users (name, email, password_hash, role) VALUES (@name, @email, @password_hash, @role)');

        res.status(201).json({ message: 'Registered successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// LOGIN
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM users WHERE email = @email');

        const user = result.recordset[0];

        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        // bcrypt compares the plain password against the stored hash
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(400).json({ message: 'Invalid credentials' });

        // create a token that contains the user's id and role
        // this is what the frontend will store and send with every request
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, role: user.role }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;