const startup = document.getElementById("startup");
const app = document.getElementById("app");

const loginSection = document.getElementById("loginSection");
const actionSection = document.getElementById("actionSection");

const loader = document.getElementById("loader");
const result = document.getElementById("result");


/* STARTUP */

window.onload = async function(){

const res = await fetch("/status");
const data = await res.json();

startup.style.display="none";
app.classList.remove("hidden");

if(data.logged_in){
showLoggedInUI();
}else{
showLoggedOutUI();
}

};


/* UI */

function showLoggedInUI(){

loginSection.classList.add("hidden");
actionSection.classList.remove("hidden");

}

function showLoggedOutUI(){

loginSection.classList.remove("hidden");
actionSection.classList.add("hidden");

}


/* LOADER */

function showLoader(){

loader.classList.remove("hidden");

}

function hideLoader(){

loader.classList.add("hidden");

}


/* LOGIN */

async function login(){

showLoader();

const email=document.getElementById("email").value;
const password=document.getElementById("password").value;

const res=await fetch("/login",{

method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({email,password})

});

const data=await res.json();

hideLoader();

if(data.status==="login_success" || data.status==="already_logged_in"){
showLoggedInUI();
}

}


/* ATTENDANCE */

async function attendance(){

showLoader();
result.innerHTML="";

const res=await fetch("/attendance");
const data=await res.json();

hideLoader();

if(!data.courses){

result.innerText="Failed to load attendance";
return;

}

let html="";

data.courses.forEach(c=>{

const conducted=parseInt(c.conducted);
const absent=parseInt(c.absent);
const present=conducted-absent;

const required=Math.ceil(conducted*0.75);
const margin=present-required;

let marginClass="margin-good";

if(margin<0){
marginClass="margin-bad";
}

let marginText=margin>=0 ? `+${margin} classes safe` : `${margin} classes shortage`;

html+=`

<div class="course">

<h3>${c.title}</h3>

<p>Total Classes: ${conducted}</p>
<p>Present: ${present}</p>
<p>Absent: ${absent}</p>

<p class="${marginClass}">

Margin: ${marginText}

</p>

</div>

`;

});

result.innerHTML=html;

}


/* MARKS */

async function marks(){

showLoader();
result.innerHTML="";

const res=await fetch("/marks");
const data=await res.json();

hideLoader();

if(!data.subjects){

result.innerText="Failed to load marks";
return;

}

let html="";

data.subjects.forEach(s=>{

html+=`

<div class="course">

<h3>${s.title}</h3>

`;

s.components.forEach(c=>{

html+=`

<p>${c.name}: ${c.score}/${c.max}</p>

`;

});

html+=`

<p><b>Total:</b> ${s.total}/${s.max}</p>

</div>

`;

});

result.innerHTML=html;

}


/* LOGOUT */

async function logout(){

await fetch("/logout",{method:"POST"});

showLoggedOutUI();

result.innerHTML="";

}