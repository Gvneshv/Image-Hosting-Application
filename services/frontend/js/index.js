window.addEventListener("DOMContentLoaded", () => {

    const indexButton = document.querySelector('.index-button')

    indexButton.addEventListener('click', () => {
        window.open("upload.html", "_self");
    })

    const image = document.querySelector(".image");

    const imagePath = `base_images/${Math.floor(Math.random() * 5) + 1}.svg`;

    image.style.backgroundImage = `url('${imagePath}')`;
})