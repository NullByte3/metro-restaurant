const getCurrentDateYYYYMMDD = () => new Date().toISOString().slice(0, 10);
let allMenuResults = [];

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
    const earthRadiusKm = 6371;
    const lat1Rad = lat1 * Math.PI/180;
    const lat2Rad = lat2 * Math.PI/180;
    const deltaLatRad = (lat2 - lat1) * Math.PI/180;
    const deltaLonRad = (lng2 - lng1) * Math.PI/180;
    
    const haversineComponent = Math.sin(deltaLatRad/2)**2 
        + Math.cos(lat1Rad) * Math.cos(lat2Rad) 
        * Math.sin(deltaLonRad/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const displayDailyMenus = async () => {
    const displayBody = document.getElementById('display-body');
    if (!displayBody) return console.error("Display body missing");
    
    const updateStatus = msg => displayBody.innerHTML = `<p>${msg}</p>`;
    updateStatus('Loading restaurants and menus...');

    let loc, locError;
    try {
        updateStatus('Requesting your location...');
        loc = await getUserLocation();
        updateStatus('Location found. Loading restaurants...');
    } catch (err) {
        console.warn("Location error:", err.message);
        locError = err.message;
        updateStatus(`Could not get location (${err.message}). Loading all restaurants...`);
    }

    try {
        const {restaurants} = await getRestaurants();
        if (!restaurants?.length) return updateStatus('No restaurants found');
        
        const withDistances = restaurants.map(r => {
            const [lng, lat] = r.location.coordinates;
            return loc ? {
                ...r, 
                distance: calculateDistance(loc.lat, loc.lng, lat, lng)
            } : {...r, distance: null};
        }).sort((a,b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

        updateStatus(`Loading menus for ${loc ? 'nearest' : 'all'} restaurants...`);
        
        allMenuResults = await Promise.all(withDistances.map(async r => {
            try {
                const menuData = await getDailyMenuForRestaurant(r._id, 'en');
                return {...r, menuData, status: 'fulfilled'};
            } catch (err) {
                return {...r, error: err, status: 'rejected'};
            }
        }));

        renderRestaurantCards(allMenuResults, locError);
        setupFilterListeners();
    } catch (err) {
        console.error("Display error:", err);
        displayBody.innerHTML = `<p class="error">Failed to load: ${err.message}</p>`;
    }
};

const renderRestaurantCards = (results, locationError) => {
    const displayBody = document.getElementById('display-body');
    if (!displayBody) return console.error("Display body missing");
    
    const createEl = (tag, props) => Object.assign(document.createElement(tag), props);
    
    displayBody.innerHTML = '';
    
    if (!results.length) return displayBody.innerHTML = '<p>No matching restaurants</p>';
    
    if (locationError) {
        displayBody.appendChild(createEl('div', {
            className: 'location-error',
            textContent: `⚠️ Could not sort by distance: ${locationError}`,
            style: 'margin-bottom:15px; padding:10px; border:1px solid orange; background:#fff3e0;'
        }));
    }

    results.forEach(r => {
        const card = createEl('div', {className: 'result-card'});
        
        const header = createEl('div', {style: 'margin-bottom: 10px;'});
        const nameElement = createEl('h2', {
            textContent: r.name,
            style: 'width: 100%; text-align: center; margin: 0; font-size: 1.5em; text-decoration: underline;'
        });
        header.appendChild(nameElement);
        card.appendChild(header);
        
        card.appendChild(createEl('p', {
            textContent: `${r.address}, ${r.city}`,
            style: 'color:#555; font-size:0.9em; margin:5px 0 10px;'
        }));

        if (r.distance !== null) {
            const distColor = r.distance < 15 ? 'green' : r.distance <= 30 ? 'orange' : 'red';
            const distanceContainer = createEl('div', {
                style: 'position: absolute; bottom: 5px; right: 5px;'
            });
            distanceContainer.appendChild(createEl('span', {
                className: 'distance-tag',
                textContent: `${r.distance.toFixed(2)} km`,
                style: `color:${distColor}; font-size: 1.1em; display: inline-block;`
            }));
            card.appendChild(distanceContainer);
        }
        
        if (r.status === 'fulfilled' && r.menuData?.courses?.length) {
            const list = createEl('ul', {style: 'list-style:none; padding-left:0;'});
            r.menuData.courses.forEach(c => {
                const item = createEl('li', {style: 'margin-bottom:10px;'});
                item.appendChild(createEl('strong', {textContent: c.name}));
                
                if (c.price) {
                    item.appendChild(document.createTextNode(` - ${c.price}`));
                }
                
                if (c.diets?.length) {
                    const diets = createEl('div', {style: 'margin-top:5px;'});
                    (typeof c.diets === 'string' ? c.diets.split(/,\s*/) : c.diets || []).filter(d => d?.trim()).forEach(d => 
                        diets.appendChild(createEl('span', {
                            className: 'diet-tag',
                            textContent: d.trim()
                        }))
                    );
                    item.appendChild(diets);
                }
                list.appendChild(item);
            });
            card.appendChild(list);
        } else {
            card.appendChild(createEl('p', {
                textContent: 'CLOSED',
                style: 'color:red; font-weight:bold;'
            }));
        }
        
        displayBody.appendChild(card);
    });
};

const setupFilterListeners = () => {
    const filterInput = document.getElementById('diet-filter-input');
    const clearButton = document.getElementById('clear-filter-button');
    if (!filterInput || !clearButton) return console.error("Filter controls missing");

    const applyFilter = () => {
        const diets = filterInput.value.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
        if (!diets.length) return renderRestaurantCards(allMenuResults);
        
        renderRestaurantCards(allMenuResults.filter(r => 
            r.status === 'fulfilled' &&
            r.menuData?.courses?.some(c => 
                (typeof c.diets === 'string' ? c.diets.split(/,\s*/) : c.diets || [])
                .map(d => d.toUpperCase())
                .some(diet => diets.includes(diet))
            )
        ));
    };

    filterInput.addEventListener('input', applyFilter);
    clearButton.addEventListener('click', () => {
        filterInput.value = '';
        renderRestaurantCards(allMenuResults);
    });
};

document.addEventListener('DOMContentLoaded', displayDailyMenus);
