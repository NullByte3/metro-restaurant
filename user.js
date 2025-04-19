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

async function getWeeklyMenuForRestaurant(restaurantId, language = 'en') {
    const endpoint = `${baseUrl}api/v1/restaurants/weekly/${restaurantId}/${language}`;
    try {
        const res = await fetch(endpoint);
        if (!res.ok) {
            if (res.status === 404 || res.status >= 500) {
                console.warn(`Skipping restaurant ${restaurantId} due to ${res.status} status`);
                return { days: [] };
            }
            const errorData = await res.json().catch(() => ({ message: `HTTP error: ${res.status}` }));
            console.error(`Error fetching weekly menu for ${restaurantId}:`, res.status, errorData.message || res.statusText);
            throw new Error(errorData.message || `Failed to fetch weekly menu: ${res.statusText}`);
        }
        const menuData = await res.json();

        const days = Array.isArray(menuData) ? menuData : menuData?.days || [];
        if (!Array.isArray(days)) {
            console.warn(`Unexpected weekly menu data structure for restaurant ${restaurantId}:`, menuData);
            return { days: [] };
        }
        return { days }; 
    } catch (error) {
        console.error(`Failed to get weekly menu for restaurant ${restaurantId}:`, error);
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
    const currentUserIsAdmin = user?.role === 'admin';

    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userInfo = document.getElementById('user-info');

    loginButton.classList.add('hidden');
    document.getElementById('edit-profile-button').classList.remove('hidden');

    userInfo.innerHTML = '';

    if (user.avatar) {
        const avatarImg = document.createElement('img');
        avatarImg.src = `${baseUrl}uploads/${user.avatar}`;
        avatarImg.style.height = '30px';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.marginRight = '10px';
        userInfo.appendChild(avatarImg);
    }

    const textContainer = document.createElement('div');
    textContainer.style.display = 'flex';
    textContainer.style.flexDirection = 'column';

    const textSpan = document.createElement('span');
    textSpan.textContent = `${user.username} ${currentUserIsAdmin ? '(Admin)' : ''}`;
    textContainer.appendChild(textSpan);

    const favRestaurant = document.createElement('span');
    favRestaurant.id = 'favorite-restaurant';
    favRestaurant.style.fontSize = '0.9em';
    favRestaurant.textContent = user.favouriteRestaurant ? `★ Favorite: ${user.favouriteRestaurant}` : '';
    textContainer.appendChild(favRestaurant);

    userInfo.appendChild(textContainer);
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
    document.getElementById('edit-profile-button').classList.add('hidden');

    logoutButton.onclick = null;

    userInfo.textContent = '';
}

function setupUpdateModal() {
    const updateModal = document.getElementById('update-modal');
    const updateButton = document.getElementById('edit-profile-button'); 
    const closeButton = updateModal.querySelector('.close-button');
    const updateForm = document.getElementById('update-form');
    const updateError = document.getElementById('update-error');

    async function openUpdateModal() {
        try {
            const userData = await getCurrentUser();
            document.getElementById('update-username').value = userData.username;
            document.getElementById('update-email').value = userData.email;

            updateModal.style.display = 'block';
            updateError.classList.add('hidden');
        } catch (error) {
            console.error("Error fetching user data for update:", error);
        }
    }

    function closeUpdateModal() {
        updateModal.style.display = 'none';
    }

    updateButton.onclick = openUpdateModal;
    closeButton.onclick = closeUpdateModal;

    window.onclick = function(event) {
        if (event.target == updateModal) {
            closeUpdateModal();
        }
    }

    const uploadAvatarButton = document.getElementById('upload-avatar-button');
    const avatarUploadStatus = document.getElementById('avatar-upload-status');
    const avatarInput = document.getElementById('update-avatar');

    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const fileName = file?.name || 'No file selected';
        document.getElementById('selected-filename').textContent = fileName;

        if (!file) return;
        if (!file) {
            avatarUploadStatus.textContent = 'Please select a file first.';
            avatarUploadStatus.classList.remove('hidden');
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${baseUrl}api/v1/users/avatar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
                throw new Error(errorData.message || 'Avatar upload failed');
            }

            const result = await response.json();
            avatarUploadStatus.textContent = '✅ Avatar uploaded successfully!';
            avatarUploadStatus.classList.remove('hidden');
            avatarUploadStatus.style.color = 'green';
            setTimeout(() => {
                avatarUploadStatus.classList.add('hidden');
            }, 2000);

            const userData = await getCurrentUser();
            updateUIForLoggedInUser(userData);

            avatarInput.value = '';
            document.getElementById('selected-filename').textContent = '';
            document.getElementById('update-username').value = '';
            document.getElementById('update-email').value = '';
            document.getElementById('update-password').value = '';
        } catch (error) {
            console.error('Avatar upload failed:', error);
            avatarUploadStatus.textContent = error.message || 'Avatar upload failed. Please check console.';
            avatarUploadStatus.classList.remove('hidden');
            avatarUploadStatus.style.color = 'red';
        }
    });

    updateForm.onsubmit = async (e) => {
        e.preventDefault();
        updateError.classList.add('hidden');

        const updateData = {};

        if (document.getElementById('update-username').value) {
            updateData.username = document.getElementById('update-username').value;
        }
        if (document.getElementById('update-email').value) {
            updateData.email = document.getElementById('update-email').value;
        }
        if (document.getElementById('update-password').value) {
            updateData.password = document.getElementById('update-password').value;
        }

        try {
            const response = await updateCurrentUser(updateData);
            const updatedUser = response.data;
            closeUpdateModal();
            updateUIForLoggedInUser(updatedUser);
            document.dispatchEvent(new CustomEvent('userLoggedIn', { detail: updatedUser }));
        } catch (error) {
            console.error("Update failed:", error);
            updateError.textContent = error.message || 'Update failed. Please check console.';
            updateError.classList.remove('hidden');
        }
    };
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
            updateUIForLoggedInUser(loginData.data);

            document.dispatchEvent(new CustomEvent('userLoggedIn', { detail: userData }));
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
            updateUIForLoggedInUser(loginData.data); 
        } catch (error) {
             console.error("Registration submission failed?:", error);
            registerError.textContent = error.message || 'Registration failed. Please check console.';
            registerError.classList.remove('hidden');
        }
    };
}

async function initializeApp() {
    setupModal();
    setupUpdateModal();

    if (isLoggedIn()) {
        try {
            const userData = await getCurrentUser();
            currentUser = userData;
            updateUIForLoggedInUser(userData);
        } catch (error) {
            console.error("Error fetching current user on load, vpn issue?", error);

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
        console.error('Error checking username availability, vpn issue?', error.message);
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
        console.error('User creation failed, vpn issue?', error.message);
        throw error;
    }
}

async function updateCurrentUser(updatedData) {
    const endpoint = `${baseUrl}api/v1/users`;
    const token = localStorage.getItem('authToken');

    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updatedData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
            throw new Error(errorData.message || `Failed to update user: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to update user, vpn issue?', error);
        throw error;
    }
}

async function updateFavoriteRestaurant(restaurantId) {
    const endpoint = `${baseUrl}api/v1/users`;
    const token = localStorage.getItem('authToken');

    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(
                restaurantId !== null 
                    ? { favouriteRestaurant: restaurantId }
                    : { favouriteRestaurant: null }
            )
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
            throw new Error(errorData.message || `Failed to update favorite: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to update favorite restaurant, vpn issue?', error);
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
        console.error('Error fetching current user, VPN issue?:', error); 
        throw error;
    }
}