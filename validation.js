const form = document.getElementById("form")
const username_input = document.getElementById("username-input")
const email_input = document.getElementById("email-input")
const password_input = document.getElementById("password-input")
const repeat_password_input = document.getElementById("repeat-password-input")
const error_message = document.getElementById("error-messages")

form.addEventListener('submit', async (e) => {
    e.preventDefault()

    let errors = []
    let payload = {}
    let endpoint = form.getAttribute('action') || window.location.pathname

    if(username_input){
        // signup
        errors = getSignupFormErrors(username_input.value, email_input.value, password_input.value, repeat_password_input ? repeat_password_input.value : '')
        payload = {
            username: username_input.value,
            email: email_input.value,
            password: password_input.value,
            repeatPassword: repeat_password_input ? repeat_password_input.value : ''
        }
    } else {
        // login
        errors = getLoginFormErrors(email_input.value, password_input.value)
        payload = { email: email_input.value, password: password_input.value }
    }

    if(errors.length > 0){
        error_message.innerText = errors.join('. ')
        return
    }

    try{
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        const data = await res.json()
        if(!res.ok){
            // show server-side validation errors
            if(data && data.errors) error_message.innerText = data.errors.join('. ')
            else error_message.innerText = data.message || 'An error occurred'
            return
        }

        // success — redirect if server provided a redirect
        if(data && data.redirect) window.location.href = data.redirect
        else window.location.reload()
    } catch (err){
        error_message.innerText = 'Unable to reach server'
        console.error(err)
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

function getLoginFormErrors(email, password){
    let errors = []

    if(email === '' || email == null){
        errors.push('Email is required')
        email_input.parentElement.classList.add('incorrect')
    }
    if(password === '' || password == null){
        errors.push('Password is required')
        password_input.parentElement.classList.add('incorrect')
    }

    return errors;
}




const allInputs = [username_input, email_input, password_input, repeat_password_input].filter(input => input != null)

allInputs.forEach(input => {
    input.addEventListener('input', () => {
        if(input.parentElement.classList.contains('incorrect')){
            input.parentElement.classList.remove('incorrect')
            error_message.innerText = ''
        }
    })
})