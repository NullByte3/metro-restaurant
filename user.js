const baseUrl = "https://media2.edu.metropolia.fi/restaurant/";

async function getRestaurants() {
    const endpoint = `${baseUrl}api/v1/restaurants`;
    try {
        const res = await fetch(endpoint);
        if (!res.ok) {

            const errorData = await res.json().catch(() => ({ message: `HTTP error: ${res.status}` })); 
            console.error("Error fetching restaurants:", res.status, errorData.message || res.statusText);
            throw new Error(errorData.message || `Failed to fetch restaurants: ${res.statusText}`);
        }
        const data = await res.json();

        if (Array.isArray(data)) {
            return { restaurants: data };
        } else if (data && Array.isArray(data.restaurants)) {
            return data; 
        } else {
             console.error("WTF is this shitty structure? ", data);
             throw new Error("Received unexpected data format for restaurants.");
        }
    } catch (error) {
        console.error("Make sure the VPN is enabled? ", error);

        throw error;
    }
}

async function getRestaurantById(restaurantId) {
    const endpoint = `${baseUrl}api/v1/restaurants/${restaurantId}`;
    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        if (!res.ok) {
            console.error(`Error fetching restaurant ${restaurantId}:`, res.status, data.message || res.statusText);
            throw new Error(data.message || `Failed to fetch restaurant: ${res.statusText}`);
        }
        return data; 
    } catch (error) {
        console.error(`Make sure the VPN is enabled? ${restaurantId}:`, error);
        throw error;
    }
}

async function getDailyMenuForRestaurant(restaurantId, language = 'en') {

    const endpoint = `${baseUrl}api/v1/restaurants/daily/${restaurantId}/${language}`;
    try {
        const res = await fetch(endpoint);
        if (!res.ok) {

            if (res.status === 404) {
                console.warn(`ghost/dead restaurant? ${restaurantId} (${language})`);

                return { courses: null, message: 'Menu not available for today.' };
            }
            console.error(`??????? ${restaurantId}:`, res.statusText);
            throw new Error(`HTTP error: ${res.status}`);
        }

        const menuData = await res.json();

        if (!menuData || !Array.isArray(menuData.courses)) {

             console.warn(`Unexpected menu data structure for restaurant ${restaurantId}:`, menuData);

             return { courses: null, message: 'Menu data format unexpected.' };
        }
        return menuData; 
    } catch (error) {
        console.error(`Failed to get daily menu for restaurant ${restaurantId}:`, error);

        throw error;
    }
}

async function login(username, password) {
    const endpoint = `${baseUrl}api/v1/auth/login`; 

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

function updateUIForLoggedInUser(user) { 
    console.log("User admin status:", currentUserIsAdmin); 

    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userInfo = document.getElementById('user-info');

    loginButton.classList.add('hidden');

    userInfo.textContent = `Welcome, ${user.username}! ${currentUserIsAdmin ? '(Admin)' : ''}`;
    userInfo.classList.remove('hidden');
    logoutButton.classList.remove('hidden');

    logoutButton.onclick = () => {
        logout(); 
        updateUIForLoggedOutUser();
    };
}

function updateUIForLoggedOutUser() {
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userInfo = document.getElementById('user-info');

    currentUserIsAdmin = false; 

    loginButton.classList.remove('hidden');
    userInfo.classList.add('hidden');
    logoutButton.classList.add('hidden');
    
    logoutButton.onclick = null;
    
    userInfo.textContent = '';
}

function setupModal() {
    const modal = document.getElementById('login-modal');
    const loginButton = document.getElementById('login-button'); 
    const closeButton = document.querySelector('.close-button');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    function openModal() {
        modal.style.display = 'block';
        loginError.classList.add('hidden');
        registerError.classList.add('hidden');
        showLoginView(); 
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    function showLoginView() {
        loginView.classList.remove('hidden');
        registerView.classList.add('hidden');
        registerError.classList.add('hidden'); 
    }

    function showRegisterView() {
        loginView.classList.add('hidden');
        registerView.classList.remove('hidden');
        loginError.classList.add('hidden'); 
    }

    loginButton.onclick = openModal;
    closeButton.onclick = closeModal;
    showRegisterLink.onclick = (e) => { e.preventDefault(); showRegisterView(); };
    showLoginLink.onclick = (e) => { e.preventDefault(); showLoginView(); };

    window.onclick = function(event) {
        if (event.target == modal) {
            closeModal();
        }
    }

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        try {
            const loginData = await login(username, password); 
            closeModal();
            const userData = await getCurrentUser();
            updateUIForLoggedInUser(userData);
            await displayDailyMenus();
            console.log("Login successful", userData);
        } catch (error) {
            console.error("Incorrect data? ", error);
            loginError.textContent = error.message || 'Login failed. Please check console.';
            loginError.classList.remove('hidden');
        }
    };

    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        registerError.classList.add('hidden');
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        if (!username || !email || !password) {
            registerError.textContent = 'All fields are required.';
            registerError.classList.remove('hidden');
            return;
        }

        try {

            await createUser(username, password, email);

            const loginData = await login(username, password);
            closeModal();
            updateUIForLoggedInUser(loginData.user); 
        } catch (error) {
             console.error("Registration submission failed?:", error);
            registerError.textContent = error.message || 'Registration failed. Please check console.';
            registerError.classList.remove('hidden');
        }
    };
}

async function initializeApp() {
    setupModal(); 

    if (isLoggedIn()) {
        try {

            const userData = await getCurrentUser();
            updateUIForLoggedInUser(userData);
        } catch (error) {
            console.error("Error fetching current user on load:", error);

            logout();
            updateUIForLoggedOutUser();
        }
    } else {
        updateUIForLoggedOutUser();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
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
    const endpoint = `${baseUrl}api/v1/users/token`; 
    const token = localStorage.getItem('authToken');

    if (!token) {
        throw new Error("No auth token found");
    }

    try {
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
             if (response.status === 401 || response.status === 403) {

                logout(); 
             }
            const errorData = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error: ${response.status}`);
        }

        const userData = await response.json();
        if (!userData || !userData.username) {
             console.error("User data not found or incomplete in response:", userData);
             throw new Error("User data not found or incomplete in response");
        }
        return userData; 
    } catch (error) {
        console.error('Error fetching current user:', error); 
        throw error;
    }
}
