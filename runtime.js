// ENDPOINT IS:  "https://media2.edu.metropolia.fi/restaurant/";

async function getRestaurants() {
    let endpoint = "https://media2.edu.metropolia.fi/restaurant/api/v1/restaurants";
    let res =  await fetch(endpoint);
    if (!res.ok) {
        console.error("Error fetching restaurants:", res.statusText);
    }
    return res.json();

}
getRestaurants()