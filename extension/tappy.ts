const BLOSS_NATIVE_NAME = "com.harrisluo.bloss_native";

// Game settings
const SCROLL_SPEED = 2.0;
const GRAVITY = 0.15;
const FLAP_HEIGHT = 5.0;
const PIPE_GAP = 40.0;
const PIPE_SEPARATION = 150.0;
const VERTICAL_HITBOX_LEEWAY = 10.0;
const HORIZONTAL_HITBOX_LEEWAY = 10.0;

// DOM bindings
const yubi = document.querySelector("#yubi")! as HTMLElement;
let yubi_rect = yubi.getBoundingClientRect();
const background_rect = document.querySelector("#background")!.getBoundingClientRect();
const score = document.querySelector("#score-val") as HTMLSpanElement;
const start_message = document.querySelector('#start-message') as HTMLDivElement;

// Global state
let game_state: "start" | "play" | "end" = "start";
let port: chrome.runtime.Port | null = null;
let yubi_aid: string | null;
let yubi_pin: Array<number> | null;

///////////////////

const key_select = () => {
    yubi_aid = "D2760001240103040006223637020000";
    yubi_pin = Array.from(new TextEncoder().encode("123456"));
};

const play = () => {
    // Set "Press yubikey to start" screen
    start_message.innerHTML = "Tap your YubiKey to start";
    yubi.style.top = "40vh";

    let dy = 0;

    const port = chrome.runtime.connectNative(BLOSS_NATIVE_NAME);

    const ask_key_to_sign = () => {
        port!.postMessage({command: {SignMessage: {
            aid: yubi_aid,
            message: [],
            pin: yubi_pin,
        }}});
    };

    const handle_bloss_error = (e: any) => {
        // TODO: display error message in game or something

        port!.disconnect();
        game_state = "end";
        //message.innerHTML = 'Press Enter To Restart';
        start_message.innerHTML = "YubiKey Error";
        alert(e);
    }

    const apply_gravity = () => {
        if (game_state != "play") {
            return
        };
        
        dy += GRAVITY;

        // Detect collision between Yubi and ground
        if (yubi_rect.bottom - VERTICAL_HITBOX_LEEWAY >= background_rect.bottom) {
            crash();
            return;
        }
        
        yubi.style.top = `${yubi_rect.top + dy}px`;
        yubi_rect = yubi.getBoundingClientRect();
        requestAnimationFrame(apply_gravity);
    }

    let dist_to_last_pipe = 0;
    const create_pipe = () => {
        if (game_state != "play") {
            return;
        }

        // If distance from last pipe exceeds threshold, make new pipes.
        if (dist_to_last_pipe > PIPE_SEPARATION) {
            dist_to_last_pipe = 0;

            // Calculate random position of pipes on y axis
            const top_of_gap = Math.floor(Math.random() * 43) + 8;
            const upper_pipe = document.createElement("div");
            upper_pipe.className = "pipe";
            upper_pipe.style.top = `${top_of_gap - 70}vh`;
            upper_pipe.style.left = "100vw";
            document.body.appendChild(upper_pipe);

            const lower_pipe = document.createElement("div");
            lower_pipe.className = "pipe";
            lower_pipe.style.top = `${top_of_gap + PIPE_GAP}vh`;
            lower_pipe.style.left = "100vw";
            document.body.appendChild(lower_pipe);
        }
        //++dist_to_last_pipe;
        requestAnimationFrame(create_pipe);
    };

    const move = () => {
        // Detect if game has ended
        if (game_state != "play") {
            return;
        }

        // Getting reference to all the pipe elements
        let pipes = document.querySelectorAll('.pipe');
        pipes.forEach((pipe_element) => {
            const pipe_rect = pipe_element.getBoundingClientRect();
            yubi_rect = yubi.getBoundingClientRect();

            // Delete pipe if it has moved off screen
            if (pipe_rect.right <= 0) {
                pipe_element.remove();
            } else {
                // Collision detection with bird and pipes
                if (
                    yubi_rect.left + HORIZONTAL_HITBOX_LEEWAY < pipe_rect.right &&
                    yubi_rect.right - HORIZONTAL_HITBOX_LEEWAY > pipe_rect.left &&
                    yubi_rect.top + VERTICAL_HITBOX_LEEWAY < pipe_rect.bottom &&
                    yubi_rect.bottom - VERTICAL_HITBOX_LEEWAY > pipe_rect.top
                ) {
                    crash();
                    return;
                } else {
                    // Increment score if pipe is passed successfully
                    if (
                        pipe_rect.right < yubi_rect.left &&
                        pipe_rect.right +
                        SCROLL_SPEED >= yubi_rect.left &&
                        pipe_rect.top <= 0 // only count upper pipe for points
                    ) {
                        score.innerHTML = (+score.innerHTML + 1).toString();
                    }
                    (pipe_element as HTMLDivElement).style.left = `${pipe_rect.left - SCROLL_SPEED}px`;
                }
            }
        });

        ++dist_to_last_pipe;
        requestAnimationFrame(move);
    }

    const first_flap = (response: any) => {
        console.log(response);
        if (response.Ok) {
            if (response.Ok !== "AwaitTouch") {
                port.onMessage.removeListener(first_flap);
                port.onMessage.addListener(flap);

                // TODO: Update UI from "Press yubikey to start" to game mode
                start_message.innerHTML = "";
                game_state = "play";
                yubi.style.top = "40vh";
                yubi_rect = yubi.getBoundingClientRect();
                dist_to_last_pipe = 0
                score.innerHTML = "0";
                document.querySelectorAll('.pipe').forEach((element) => {
                    element.remove();
                });

                dy = - FLAP_HEIGHT;
                console.log("first flap");

                // Activate gravity
                requestAnimationFrame(apply_gravity);

                // Start pipe generation
                requestAnimationFrame(create_pipe);

                // Start scrolling
                requestAnimationFrame(move);

                ask_key_to_sign();
            }
        } else {
            if (response.Error === "TouchConfirmationTimeout") {
                ask_key_to_sign();
            } else {
                handle_bloss_error(response.Error);
            }
        }
    }

    const flap = (response: any) => {
        console.log(response);
        if (response.Ok) {
            if (response.Ok !== "AwaitTouch") {
                dy = - FLAP_HEIGHT;
                console.log("flap");
                ask_key_to_sign();
            }
        } else {
            handle_bloss_error(response.Error);
        }
    };

    // TODO: search for port! and replace with port

    port.onMessage.addListener(first_flap);
    port.onDisconnect.addListener(() => {
        // TODO: This should be an error case since bloss-native disconnects.
        console.log('Disconnected');
    });

    const crash = () => {
        game_state = "end";
        start_message.innerHTML = "Tap your YubiKey to start";

        port.onMessage.removeListener(flap);
        port.onMessage.addListener(first_flap);
        console.log("restart");
        ask_key_to_sign();
    };

    // Trigger the first touch confirm that will lead to a flap
    ask_key_to_sign();
};

///////////////////////////////////

key_select();
play();

/////////////////

// Listener for game start
/*document.addEventListener("keydown", (e) => {
    // Start the game if enter key is pressed
    if (e.key == " " && game_state != "play") {
        document.querySelectorAll('.pipe').forEach((e) => {
            e.remove();
        });
        yubi.style.top = "40vh";
        yubi_rect = yubi.getBoundingClientRect();
        game_state = "play";
        start_message.innerHTML = "";
        score.innerHTML = "0";

        port = chrome.runtime.connectNative(BLOSS_NATIVE_NAME);

        play();
    }
});

function _play() {
    let dy = -FLAP_HEIGHT;
    const port = chrome.runtime.connectNative(BLOSS_NATIVE_NAME);

    // const flap = (e: KeyboardEvent) => {
    //     if (e.key == 'ArrowUp' || e.key == ' ') {
    //         dy = -FLAP_HEIGHT;
    //     }
    // }

    const first_flap = () => {

    }

    const flap = () => {
        dy = -FLAP_HEIGHT;
        port!.postMessage({command: {SignMessage: {
            aid: "D2760001240103040006205304730000",
            message: Array.from(new TextEncoder().encode("")),
            pin: Array.from(new TextEncoder().encode("123456")),
        }}});
    }

    function apply_gravity() {
        if (game_state != "play") {
            return
        };
        
        dy += GRAVITY;
        //document.addEventListener('keydown', flap);

        // Collision detection with bird and
        // window top and bottom

        if (yubi_rect.top <= 0 || yubi_rect.bottom >= background_rect.bottom) {
            game_state = "end";
            //message.innerHTML = 'Press Enter To Restart';
            start_message.innerHTML = "Press SPACE to start";
            console.log("Disconnect start");
            port!.disconnect();
            return;
        }
        
        yubi.style.top = `${yubi_rect.top + dy}px`;
        yubi_rect = yubi.getBoundingClientRect();
        requestAnimationFrame(apply_gravity);
    }

    port!.onMessage.addListener((response) => {
        console.log(response);
        if (response.Ok) {
            if (response.Ok !== "AwaitTouch") {
                flap();
            }
        } else {
            port!.disconnect();
            game_state = "end";
            //message.innerHTML = 'Press Enter To Restart';
            start_message.innerHTML = "YubiKey Error";
            alert(response.Error);
            return;
        }
    });
    port!.onDisconnect.addListener(() => {
        console.log('Disconnected');
    });
    requestAnimationFrame(apply_gravity);
    flap();
}

//////////////////////////////////////////////////////////////////


/*function play() {
    function move() {

        // Detect if game has ended
        if (game_state != 'Play') return;

        // Getting reference to all the pipe elements
        let pipe_sprite = document.querySelectorAll('.pipe_sprite');
        pipe_sprite.forEach((element) => {

            let pipe_sprite_props = element.getBoundingClientRect();
            bird_props = bird.getBoundingClientRect();

            // Delete the pipes if they have moved out
            // of the screen hence saving memory
            if (pipe_sprite_props.right <= 0) {
                element.remove();
            } else {
                // Collision detection with bird and pipes
                if (
                    bird_props.left < pipe_sprite_props.left +
                    pipe_sprite_props.width &&
                    bird_props.left +
                    bird_props.width > pipe_sprite_props.left &&
                    bird_props.top < pipe_sprite_props.top +
                    pipe_sprite_props.height &&
                    bird_props.top +
                    bird_props.height > pipe_sprite_props.top
                ) {

                    // Change game state and end the game
                    // if collision occurs
                    game_state = 'End';
                    message.innerHTML = 'Press Enter To Restart';
                    message.style.left = '28vw';
                    return;
                } else {
                    // Increase the score if player
                    // has the successfully dodged the
                    if (
                        pipe_sprite_props.right < bird_props.left &&
                        pipe_sprite_props.right +
                        move_speed >= bird_props.left &&
                        element.increase_score == '1'
                    ) {
                        score_val.innerHTML = +score_val.innerHTML + 1;
                    }
                    element.style.left =
                        pipe_sprite_props.left - move_speed + 'px';
                }
            }
        });

        requestAnimationFrame(move);
    }
    requestAnimationFrame(move);

    let bird_dy = 0;
    function apply_gravity() {
        if (game_state != 'Play') return;
        bird_dy = bird_dy + gravity;
        document.addEventListener('keydown', (e) => {
            if (e.key == 'ArrowUp' || e.key == ' ') {
                bird_dy = -7.6;
            }
        });

        // Collision detection with bird and
        // window top and bottom

        if (bird_props.top <= 0 ||
            bird_props.bottom >= background.bottom) {
            game_state = 'End';
            message.innerHTML = 'Press Enter To Restart';
            message.style.left = '28vw';
            return;
        }
        bird.style.top = bird_props.top + bird_dy + 'px';
        bird_props = bird.getBoundingClientRect();
        requestAnimationFrame(apply_gravity);
    }
    requestAnimationFrame(apply_gravity);

    let pipe_seperation = 0;

    // Constant value for the gap between two pipes
    let pipe_gap = 35;
    function create_pipe() {
        if (game_state != 'Play') return;

        // Create another set of pipes
        // if distance between two pipe has exceeded
        // a predefined value
        if (pipe_seperation > 115) {
            pipe_seperation = 0

            // Calculate random position of pipes on y axis
            let pipe_posi = Math.floor(Math.random() * 43) + 8;
            let pipe_sprite_inv = document.createElement('div');
            pipe_sprite_inv.className = 'pipe_sprite';
            pipe_sprite_inv.style.top = pipe_posi - 70 + 'vh';
            pipe_sprite_inv.style.left = '100vw';

            // Append the created pipe element in DOM
            document.body.appendChild(pipe_sprite_inv);
            let pipe_sprite = document.createElement('div');
            pipe_sprite.className = 'pipe_sprite';
            pipe_sprite.style.top = pipe_posi + pipe_gap + 'vh';
            pipe_sprite.style.left = '100vw';
            pipe_sprite.increase_score = '1';

            // Append the created pipe element in DOM
            document.body.appendChild(pipe_sprite);
        }
        pipe_seperation++;
        requestAnimationFrame(create_pipe);
    }
    requestAnimationFrame(create_pipe);
}
*/