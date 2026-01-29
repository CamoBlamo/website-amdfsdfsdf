const form = document.getElementById("form")
const username_input = document.getElementById("username-input")
const email_input = document.getElementById("email-input")
const password_input = document.getElementById("password-input")
const repeat_password_input = document.getElementById("repeat-password-input")
const error_message = document.getElementById("error-messages")

form.addEventListener('submit', (e) => {
    // e.preventDefault() prevent submit

    let errors = []

    if(username_input){
        // if we have a username input option then the signup page is currently active
        errors = getSignupFormErrors(username_input.value, email_input.value, password_input.value, repeat_password_input.value)
    }
    else{
        // if we dont have username input then the log in page is currently active
        errors = getLoginFormErrors(email_input.value, password_input.value)
    }

    if(errors.length > 0){
        // if there are any errors in array
        e.preventDefault()
        error_message.innerText = errors.join(". ")
    }
})
function getSignupFormErrors(username, email, password, repeatPassword){
    let errors = []

    if(username === '' || username == null){
        errors.push('A username is required')
        username_input.parentElement.classList.add('incorrect')
    }
        if(password === '' || password == null){
        errors.push('A password is required')
        password_input.parentElement.classList.add('incorrect')
    }
        if(email === '' || email == null){
        errors.push('A email is required')
        email_input.parentElement.classList.add('incorrect')
    }
        if(password !== repeatPassword){
        errors.push('Passwords do not match')
        password_input.parentElement.classList.add('incorrect')
        repeat_password_input.parentElement.classList.add('incorrect')
    }
        if(password.length < 8){
        errors.push('Password must be at least 8 characters')
        password_input.parentElement.classList.add('incorrect')
    }
    return errors;
}
const allInputs = [username_input, email_input, password_input, repeat_password_input]

allInputs.forEach(input => {
    input.addEventListener('input', () => {
        if(input.parentElement.classList.contains('incorrect')){
            input.parentElement.classList.remove('incorrect')
            error_message.innerText = ''
        }
    })
})