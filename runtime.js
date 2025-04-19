const formatDateYYYYMMDD = (date) => date.toISOString().slice(0, 10);

const formatDateForAPIComparison = (date) => {

    const options = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' };

    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        timeZone: 'UTC'
    }).format(date)
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

let selectedDate = new Date(); 
let allRestaurantData = []; 
let userLocation = null;
let locationError = null;

const getUserLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Error("Geolocation unsupported"));
    navigator.geolocation.getCurrentPosition(
        ({coords}) => resolve({lat: coords.latitude, lng: coords.longitude}),
        (error) => reject(Error([
            "Could not get location: ",
            error.PERMISSION_DENIED && "The permission denied",
            error.POSITION_UNAVAILABLE && "The location is unavailable", 
            error.TIMEOUT && "Request timeout?",
            error.UNKNOWN_ERROR && "Unknown error (click f12 to open the console and see)"
        ].find(msg => msg) || "Location error"))
    );
});

const calculateDistance = (lat1, lng1, lat2, lng2) => {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null; 
    const earthRadiusKm = 6371;
    const lat1Rad = lat1 * Math.PI/180;
    const lat2Rad = lat2 * Math.PI/180;
    const deltaLatRad = (lat2 - lat1) * Math.PI/180;
    const deltaLonRad = (lng2 - lng1) * Math.PI/180;

    const haversineComponent = Math.sin(deltaLatRad/2)**2
        + Math.cos(lat1Rad) * Math.cos(lat2Rad)
        * Math.sin(deltaLonRad/2)**2;
    const centralAngle = 2 * Math.atan2(Math.sqrt(haversineComponent), Math.sqrt(1 - haversineComponent));
    return earthRadiusKm * centralAngle;
};

const initializeAndFetchData = async () => {
    const displayBody = document.getElementById('display-body');
    if (!displayBody) return console.error("Display body missing");

    const updateStatus = msg => displayBody.innerHTML = `<p>${msg}</p>`;
    updateStatus('Initializing...');

    try {
        updateStatus('Requesting your location...');
        userLocation = await getUserLocation();
        locationError = null; 
        updateStatus('Location found. Loading restaurants...');
    } catch (err) {
        console.warn("Location error:", err.message);
        userLocation = null; 
        locationError = err.message; 
        updateStatus(`Could not get location (${err.message}). Loading all restaurants...`);
    }

    try {
        const restaurantData = await getRestaurants(); 

        if (!restaurantData || !Array.isArray(restaurantData.restaurants) || !restaurantData.restaurants.length) {
             console.error("Invalid or empty restaurant data received:", restaurantData);
             return updateStatus('No restaurants found or invalid data received.');
        }
        const restaurants = restaurantData.restaurants; 

        allRestaurantData = restaurants.map(r => {
            const [lng, lat] = r.location?.coordinates || [null, null];
            const distance = userLocation ? calculateDistance(userLocation.lat, userLocation.lng, lat, lng) : null;
            return {
                ...r,
                distance: distance,
                weeklyMenuData: null, 
                status: 'pending' 
            };
        }).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)); 

        updateStatus(`Found ${allRestaurantData.length} restaurants. Loading weekly menus...`);

        const menuPromises = allRestaurantData.map(async (r) => {
            try {
                const weeklyMenu = await getWeeklyMenuForRestaurant(r._id, 'en');
                r.weeklyMenuData = weeklyMenu;
                r.status = 'fulfilled';
            } catch (err) {
                console.error(`Failed to fetch weekly menu for ${r.name} (${r._id}):`, err);
                r.status = 'rejected';
                r.error = err; 
            }
            return r; 
        });

        const menuResults = await Promise.allSettled(menuPromises);

        menuResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allRestaurantData[index] = result.value;
            } else {
                console.error(`Menu fetch failed for ${allRestaurantData[index].name}:`, result.reason);
                allRestaurantData[index].status = 'rejected';
            }
        });

        updateStatus(`Menus loaded (${allRestaurantData.filter(r => r.status === 'fulfilled').length}/${allRestaurantData.length} succeeded). Rendering...`);

        setupDateInput();
        renderMenusForSelectedDate(); 
        setupFilterListeners(); 

    } catch (err) {
        console.error("Initialization or fetch error:", err);
        updateStatus(`<p class="error">Failed to load restaurant data: ${err.message}</p>`);
    }
};

const renderMenusForSelectedDate = async () => {
    const displayBody = document.getElementById('display-body');
    const dateInput = document.getElementById('menu-date-input');
    const menuHeading = document.getElementById('menu-date-heading');
    if (!displayBody || !dateInput || !menuHeading) return console.error("UI elements missing for rendering");

    const createEl = (tag, props) => Object.assign(document.createElement(tag), props);

    const selectedDateString = dateInput.value; 
    if (!selectedDateString) {
        console.warn("Date input has no value, defaulting to today.");
        selectedDate = new Date(); 
        dateInput.value = formatDateYYYYMMDD(selectedDate); 
    } else {

         const parts = selectedDateString.split('-');
         selectedDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    }

    const selectedDateAPIStr = formatDateForAPIComparison(selectedDate);

    const selectedDateInputStr = formatDateYYYYMMDD(selectedDate);

    const todayStr = formatDateYYYYMMDD(new Date());

    menuHeading.textContent = `Menus for ${selectedDateInputStr === todayStr ? 'Today' : selectedDateAPIStr}`;

    displayBody.innerHTML = ''; 

    if (locationError) {
        displayBody.appendChild(createEl('div', {
            className: 'location-error',
            textContent: `⚠️ Could not get location for distance sorting: ${locationError}`,
            style: 'margin-bottom:15px; padding:10px; border:1px solid orange; background:#fff3e0; text-align: center;'
        }));
    }

    const filteredResults = applyFilter(); 

    if (!filteredResults.length) {
        displayBody.innerHTML += '<p>No restaurants match the current filter for this day.</p>'; 
        return;
    }

    const hasMenuCards = [];
    const noMenuCards = [];

    for (const r of filteredResults) {
        const card = createEl('div', { className: 'result-card' });

        const header = createEl('div', { style: 'margin-bottom: 10px; position: relative;' });

        const favButton = createEl('button', { 
            className: 'favorite-button',
            innerHTML: '☆',
            title: 'Click to toggle favorite'
        });
        if (isLoggedIn()) {
            const currentUser = await getCurrentUser().catch(() => null);
            const favRestaurantId = currentUser?.favouriteRestaurant;
            if (favRestaurantId === r._id) {
                favButton.innerHTML = '★';
                favButton.classList.add('active');
            }
            favButton.onclick = async () => {
                if (!isLoggedIn()) return;
                try {
                    const response = await updateFavoriteRestaurant(r._id);
                    const userData = response.data;
                    await updateUIForLoggedInUser(userData);
                    await renderMenusForSelectedDate(); 

                    favButton.textContent = '★';
                    favButton.classList.add('active');
                } catch (error) {
                    console.error('Failed to update favorite:', error);
                }
            };
            header.appendChild(favButton);
        }

        const nameElement = createEl('h2', {
            textContent: r.name,
            style: 'width: 100%; text-align: center; margin: 0; font-size: 1.5em; text-decoration: underline;'
        });
        header.appendChild(nameElement);
        card.appendChild(header);

        card.appendChild(createEl('p', {
            textContent: `${r.address || 'No address'}, ${r.city || 'No city'}`,
            style: 'color:#555; font-size:0.9em; margin:5px 0 10px;'
        }));

        if (r.distance !== null) {
            const distColor = r.distance < 15 ? 'green' : r.distance <= 30 ? 'orange' : 'red';
            const distanceContainer = createEl('div', {
                style: 'position: absolute; bottom: 5px; right: 5px;' 
            });
            distanceContainer.appendChild(createEl('span', {
                className: 'distance-tag',
                textContent: `${r.distance.toFixed(1)} km`, 
                style: `color:${distColor}; font-size: 1.0em; display: inline-block;` 
            }));
            card.appendChild(distanceContainer);
        }

        const selectedDateAPIStr = formatDateForAPIComparison(selectedDate);
        const dayMenu = r.status === 'fulfilled' && r.weeklyMenuData.days?.find(day => {

            return day.date === selectedDateAPIStr || 
                   day.date.replace(/,/g, '') === selectedDateAPIStr;
        });

        if (dayMenu && dayMenu.courses) {
            const list = createEl('ul', { style: 'list-style:none; padding-left:0;' });
            dayMenu.courses.forEach(c => {
                const item = createEl('li', { style: 'margin-bottom:10px;' });
                item.appendChild(createEl('strong', { textContent: c.name || 'Unnamed Course' })); 

                if (c.price) {
                    item.appendChild(document.createTextNode(` - ${c.price}`));
                }

                if (c.diets?.length) {
                    const dietsContainer = createEl('div', { style: 'margin-top:5px;' });

                    const dietsArray = (typeof c.diets === 'string' ? c.diets.split(/,\s*/) : c.diets || [])
                                       .map(d => d?.trim()).filter(Boolean);

                    dietsArray.forEach(d =>
                        dietsContainer.appendChild(createEl('span', {
                            className: 'diet-tag',
                            textContent: d
                        }))
                    );
                    if (dietsArray.length > 0) { 
                       item.appendChild(dietsContainer);
                    }
                }
                list.appendChild(item);
            });
            card.appendChild(list);
        } else if (r.status === 'rejected') {
             card.appendChild(createEl('p', {
                textContent: 'Error loading menu',
                style: 'color:orange; font-weight:bold;'
            }));
        }
         else {
            card.appendChild(createEl('p', {
                textContent: 'No menu available for this day',
                style: 'color:grey; font-style:italic;'
            }));
        }

        if (dayMenu && dayMenu.courses) {
            hasMenuCards.push(card);
        } else {
            card.classList.add('no-menu-card');
            noMenuCards.push(card);
        }
    }

    hasMenuCards.forEach(card => displayBody.appendChild(card));

    if (noMenuCards.length > 0) {
        const separator = createEl('h3', {
            textContent: 'Restaurants without menu for this day',
            style: 'width: 100%; text-align: center; margin: 20px 0 10px; color: #666;'
        });
        displayBody.appendChild(separator);
        noMenuCards.forEach(card => displayBody.appendChild(card));
    }
};

const setupDateInput = () => {
    const dateInput = document.getElementById('menu-date-input');
    if (!dateInput) return console.error("Date input element missing");

    dateInput.value = formatDateYYYYMMDD(selectedDate);

    dateInput.addEventListener('change', renderMenusForSelectedDate);
};

const applyFilter = () => {
    const dietFilterInput = document.getElementById('diet-filter-input');
    const cityFilterInput = document.getElementById('city-filter-input');

    if (!dietFilterInput || !cityFilterInput) {
        console.error("Filter inputs missing");
        return allRestaurantData;
    }

    const dietsToFilter = dietFilterInput.value.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
    const cityFilter = cityFilterInput.value.trim().toLowerCase();

    const selectedDateAPIStr = formatDateForAPIComparison(selectedDate);

    return allRestaurantData.filter(r => {
        if (r.status !== 'fulfilled' || !r.weeklyMenuData?.days) {
            return false;
        }

        if (cityFilter && !(r.city?.toLowerCase().includes(cityFilter))) {
            return false;
        }

        const dayMenu = r.weeklyMenuData.days.find(day => day.date === selectedDateAPIStr);
        if (!dayMenu || !dayMenu.courses) {
            return false; 
        }

        if (dietsToFilter.length > 0) {
            return dayMenu.courses.some(course => {
                const courseDiets = (typeof course.diets === 'string' ? course.diets.split(/,\s*/) : course.diets || [])
                                    .map(d => d?.trim().toUpperCase()).filter(Boolean);
                return courseDiets.some(cd => dietsToFilter.includes(cd));
            });
        }

        return true;
    });
};

const setupFilterListeners = () => {
    const dietFilterInput = document.getElementById('diet-filter-input');
    const cityFilterInput = document.getElementById('city-filter-input');
    const clearButton = document.getElementById('clear-filter-button');
    if (!dietFilterInput || !cityFilterInput || !clearButton) return console.error("Filter controls missing");

    dietFilterInput.addEventListener('input', renderMenusForSelectedDate);
    cityFilterInput.addEventListener('input', renderMenusForSelectedDate);

    clearButton.addEventListener('click', () => {
        dietFilterInput.value = '';
        cityFilterInput.value = '';
        renderMenusForSelectedDate();
    });
};

document.addEventListener('userLoggedIn', () => {
    renderMenusForSelectedDate();
    initializeAndFetchData();
});

window.addEventListener('storage', (event) => {
    if (event.key === 'authToken') {
        document.dispatchEvent(new Event('authStateChanged'));
    }
});

document.addEventListener('DOMContentLoaded', initializeAndFetchData);