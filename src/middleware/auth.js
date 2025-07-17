import express from 'express';
import basicAuth from 'express-basic-auth';

// Add this after creating the express app
export function setupAuth(app) {
    // Basic authentication for the team
    const users = {
        'joe': process.env.JOE_PASSWORD || 'changemeuuxv47',
        'charlie': process.env.CHARLIE_PASSWORD || 'changemeq3v8uq',
        'tre': process.env.TRE_PASSWORD || 'changemew3hewp',
        'josh': process.env.JOSH_PASSWORD || 'changemer2bb3t'
    };

    console.log('DEBUG AUTH USERS:', users);

    // Apply auth to specific protected routes
    app.use(['/admin', '/executive-dashboard', '/api/admin'], basicAuth({
        users: users,
        challenge: true,
        unauthorizedResponse: 'Access denied. Please check your credentials.'
    }));

    // Executive dashboard requires executive credentials
    app.use('/executive-dashboard', (req, res, next) => {
        if (req.auth?.user !== 'tre' && req.auth?.user !== 'josh') {
            return res.status(403).send('Executive access only');
        }
        next();
    });
    
    // Admin interface requires executive credentials
    app.use('/admin', (req, res, next) => {
        if (req.auth?.user !== 'tre' && req.auth?.user !== 'josh') {
            return res.status(403).send('Admin access only');
        }
        next();
    });
}