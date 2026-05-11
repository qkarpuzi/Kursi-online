const express = require("express");
const cors = require("cors");
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json()); //E Lejon express me i lexo requestat e JSON bodies
app.use(express.static('public'));

//Routes ose Rruget
app.use('/uploads', express.static('uploads'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/assignments', require('./routes/assignments'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveri po punon ne portin ${PORT}`);
    console.log(`http://localhost:${PORT}`); 
    console.log(`http://localhost:${PORT}/api/auth`); 
});
