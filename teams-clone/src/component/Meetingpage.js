import { useEffect, useReducer, useState, useRef } from "react";
import 'bootstrap/dist/css/bootstrap.min.css';
import { useHistory, useParams } from 'react-router-dom';
import Peer from 'simple-peer';
import React from 'react';
import 'font-awesome/css/font-awesome.min.css'
import './style.css';
import random from 'random-name';
import VideoCard from './VideoCard';
import Chat from "./chat";
import socket from '../socket';


const Meetingpage = (props) => {

    const history = useHistory();
    // let { id } = useParams();
    // let { roomId } = useParams();
    // const currentUser = 'abc';
    const url = `${window.location.origin}${window.location.pathname}`;
    const currentUser = random.first();
    // const currentUser = sessionStorage.getItem('user');
    const [peers, setPeers] = useState([]);
    const [userVideoAudio, setUserVideoAudio] = useState({
        localUser: { video: true, audio: true },
    });
    const [videoDevices, setVideoDevices] = useState([]);
    const [displayChat, setDisplayChat] = useState(false);
    const [screenShare, setScreenShare] = useState(false);
    const [showVideoDevices, setShowVideoDevices] = useState(false);
    const peersRef = useRef([]);
    const userVideoRef = useRef();
    // const othervideo = useRef();
    const screenTrackRef = useRef();
    const userStream = useRef();
    const roomId = props.match.params.roomId;

    useEffect(() => {
        // Get Video Devices
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            const filtered = devices.filter((device) => device.kind === 'videoinput');
            setVideoDevices(filtered);
        });

        // Set Back Button Event
        window.addEventListener('popstate', goToBack);

        // Connect Camera & Mic
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((stream) => {
                userVideoRef.current.srcObject = stream;
                userStream.current = stream;

                socket.emit('BE-join-room', { roomId, userName: currentUser });
                socket.on('FE-user-join', (users) => {
                    // all users
                    const peers = [];
                    users.forEach(({ userId, info }) => {
                        let { userName, video, audio } = info;

                        if (userName !== currentUser) {
                            const peer = createPeer(userId, socket.id, stream);

                            peer.userName = userName;
                            peer.peerID = userId;

                            peersRef.current.push({
                                peerID: userId,
                                peer,
                                userName,
                            });
                            peers.push(peer);

                            setUserVideoAudio((preList) => {
                                return {
                                    ...preList,
                                    [peer.userName]: { video, audio },
                                };
                            });
                        }
                    });

                    setPeers(peers);
                });

                socket.on('FE-receive-call', ({ signal, from, info }) => {
                    let { userName, video, audio } = info;
                    const peerIdx = findPeer(from);

                    if (!peerIdx) {
                        const peer = addPeer(signal, from, stream);

                        peer.userName = userName;

                        peersRef.current.push({
                            peerID: from,
                            peer,
                            userName: userName,
                        });
                        setPeers((users) => {
                            return [...users, peer];
                        });
                        setUserVideoAudio((preList) => {
                            return {
                                ...preList,
                                [peer.userName]: { video, audio },
                            };
                        });
                    }
                });

                socket.on('FE-call-accepted', ({ signal, answerId }) => {
                    const peerIdx = findPeer(answerId);
                    peerIdx.peer.signal(signal);
                });

                socket.on('FE-user-leave', ({ userId, userName }) => {
                    const peerIdx = findPeer(userId);
                    peerIdx.peer.destroy();
                    setPeers((users) => {
                        users = users.filter((user) => user.peerID !== peerIdx.peer.peerID);
                        return [...users];
                    });
                });
            });

        socket.on('FE-toggle-camera', ({ userId, switchTarget }) => {
            const peerIdx = findPeer(userId);

            setUserVideoAudio((preList) => {
                let video = preList[peerIdx.userName].video;
                let audio = preList[peerIdx.userName].audio;

                if (switchTarget === 'video') video = !video;
                else audio = !audio;

                return {
                    ...preList,
                    [peerIdx.userName]: { video, audio },
                };
            });
        });

        return () => {
            socket.disconnect();
        };
        // eslint-disable-next-line
    }, []);


    function createPeer(userId, caller, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', (signal) => {
            socket.emit('BE-call-user', {
                userToCall: userId,
                from: caller,
                signal,
            });
        });
        peer.on('disconnect', () => {
            peer.destroy();
        });

        return peer;
    }

    function addPeer(incomingSignal, callerId, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', (signal) => {
            socket.emit('BE-accept-call', { signal, to: callerId });
        });

        peer.on('disconnect', () => {
            peer.destroy();
        });

        peer.signal(incomingSignal);

        return peer;
    }

    function findPeer(id) {
        return peersRef.current.find((p) => p.peerID === id);
    }

    function createUserVideo(peer, index, arr) {
        console.log(index);
        return (
            <div className="p-2 h-100 w-100" key={index}>
                {writeUserName(peer.userName)}
                <VideoCard key={index} peer={peer} number={arr.length} />
            </div>
        );
    }

    function writeUserName(userName, index) {
        if (userVideoAudio.hasOwnProperty(userName)) {
            if (!userVideoAudio[userName].video) {
                return <div key={userName}>{userName}</div>;
            }
        }
    }

    // Open Chat
    const clickChat = (e) => {
        e.stopPropagation();
        setDisplayChat(!displayChat);
    };

    // BackButton
    const goToBack = (e) => {
        e.preventDefault();
        socket.emit('BE-leave-room', { roomId, leaver: currentUser });
        sessionStorage.removeItem('user');
        window.location.href = '/';
    };

    const toggleCameraAudio = (e) => {
        const target = e.target.getAttribute('data-switch');

        setUserVideoAudio((preList) => {
            let videoSwitch = preList['localUser'].video;
            let audioSwitch = preList['localUser'].audio;

            if (target === 'video') {
                const userVideoTrack = userVideoRef.current.srcObject.getVideoTracks()[0];
                videoSwitch = !videoSwitch;
                userVideoTrack.enabled = videoSwitch;
            } else {
                const userAudioTrack = userVideoRef.current.srcObject.getAudioTracks()[0];
                audioSwitch = !audioSwitch;

                if (userAudioTrack) {
                    userAudioTrack.enabled = audioSwitch;
                } else {
                    userStream.current.getAudioTracks()[0].enabled = audioSwitch;
                }
            }

            return {
                ...preList,
                localUser: { video: videoSwitch, audio: audioSwitch },
            };
        });

        socket.emit('BE-toggle-camera-audio', { roomId, switchTarget: target });
    };

    const clickScreenSharing = () => {
        if (!screenShare) {
            navigator.mediaDevices
                .getDisplayMedia({ cursor: true })
                .then((stream) => {
                    const screenTrack = stream.getTracks()[0];

                    peersRef.current.forEach(({ peer }) => {
                        // replaceTrack (oldTrack, newTrack, oldStream);
                        peer.replaceTrack(
                            peer.streams[0]
                                .getTracks()
                                .find((track) => track.kind === 'video'),
                            screenTrack,
                            userStream.current
                        );
                    });

                    // Listen click end
                    screenTrack.onended = () => {
                        peersRef.current.forEach(({ peer }) => {
                            peer.replaceTrack(
                                screenTrack,
                                peer.streams[0]
                                    .getTracks()
                                    .find((track) => track.kind === 'video'),
                                userStream.current
                            );
                        });
                        userVideoRef.current.srcObject = userStream.current;
                        setScreenShare(false);
                    };

                    userVideoRef.current.srcObject = stream;
                    screenTrackRef.current = screenTrack;
                    setScreenShare(true);
                });
        } else {
            screenTrackRef.current.onended();
        }
    };

    const expandScreen = (e) => {
        const elem = e.target;

        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            /* Firefox */
            elem.mozRequestFullScreen();
        } else if (elem.webkitRequestFullscreen) {
            /* Chrome, Safari & Opera */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            /* IE/Edge */
            elem.msRequestFullscreen();
        }
    };

    const clickBackground = () => {
        if (!showVideoDevices) return;

        setShowVideoDevices(false);
    }

    function post() {
        document.getElementById("changeToEmpty").value = ''
    }


    // css starts here
    const fullheight = {
        height: (window.innerHeight) * 95 / 100,
    };
    const topmargin = {
        marginTop: "15px",
        marginBottom: "15px"
    };
    // css ends here

    return (
        <div className="container">
            <div className="row" style={topmargin}>
                <div className="col-9">
                    <div className="row">
                        <div className="col-12 bg-dark position-relative" style={fullheight}>
                            <div className="d-flex flex-row h-100 w-100">
                                {peers && peers.map((peer, index, arr) => createUserVideo(peer, index, arr))}
                            </div>
                            <div class="btn-group position-absolute bottom-0 start-0" role="group" aria-label="Basic outlined example">
                                <button type="button" class="btn btn-outline-light" onClick={() => navigator.clipboard.writeText(url)} >Copy Invite Link</button>
                                <button type="button" class="btn btn-outline-light" onClick={toggleCameraAudio}  data-switch='audio' >{userVideoAudio['localUser'].audio ? `Mute Audio` : `Unmute Audio`}</button>
                                <button type="button" class="btn btn-outline-light" onClick={goToBack}>Leave Call</button>
                            </div>
                            <div className="position-absolute bottom-0 end-0 h-25 w-25">
                                <video className="h-100 w-100" playsInline muted ref={userVideoRef} autoPlay />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-3">
                    <Chat display={displayChat} roomId={roomId} />
                    {/* <div className="row">
                        <div className="col-12 bg-light position-relative" style={fullheight}>
                            <div className="h-100 w-100 overflow-auto">
                                {messageList.map((item) => (
                                    <div className="card bg-white mt-1 mb-2">
                                        <h5 className="card-header">{item.user}</h5>
                                        <p className="card-body">{item.msg}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="position-absolute bottom-0 start-0 w-100 ">
                                <div className="input-group">
                                    <input
                                        className="form-control"
                                        placeholder="Enter message"
                                        id="changeToEmpty"
                                        onChange={(e) => changeMsg(e)}
                                        onKeyPress={event => {
                                            if (event.key === 'Enter') {
                                                sendText();
                                            }
                                        }}
                                    />

                                    <div className="input-group-append">
                                        <button className="btn btn-outline-secondary" onClick={sendText} >
                                            <i class="fa fa-paper-plane"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div> */}
                </div>
            </div>
        </div >
    );
}

export default Meetingpage;