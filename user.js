const baseUrl = "https://media2.edu.metropolia.fi/restaurant/";
async function getRestaurants() {
    const endpoint = `${baseUrl}api/v1/restaurants`;
    let res = await fetch(endpoint);
    if (!res.ok) {
        console.error("Error fetching restaurants:", res.statusText);
    }
    return res.json();

}

async function login(username, password) {
    const endpoint = `${baseUrl}/api/v1/auth/login`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.message && !data.token) {
                throw new Error(data.message);
            }
            throw new Error(`HTTP error: ${response.status}`);
        }

        if (data.token) {
            localStorage.setItem('authToken', data.token);
        }

        return data;
    } catch (error) {
        console.error('Login failed:', error.message);
        throw error;
    }
}

function logout() {
    localStorage.removeItem('authToken');
}

function isLoggedIn() {
    return !!localStorage.getItem('authToken');
}

async function checkAvailability(username) {
    const endpoint = `${baseUrl}api/v1/users/available/${username}`;

    try {
        const response = await fetch(endpoint);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.available;
    } catch (error) {
        console.error('Error checking username availability:', error.message);
        throw error;
    }
}

async function createUser(username, password, email) {
    const endpoint = `${baseUrl}api/v1/users`;
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                email
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.message) {
                throw new Error(data.message);
            }
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('User creation failed:', error.message);
        throw error;
    }
}

async function getCurrentUser() {
    const endpoint = `${baseUrl}api/v1/auth/me`;

    try {
        const userData = await authenticatedRequest(endpoint);
        return userData;
    } catch (error) {
        throw error;
    }
}
