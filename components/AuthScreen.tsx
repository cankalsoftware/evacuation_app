import { showToast } from "./Toast";
import React, { useState } from "react";
import { View, ActivityIndicator, Image } from "react-native";
import { useSignIn, useSignUp } from "@clerk/clerk-expo";

import { Text, TextInput, TouchableOpacity } from "./ResponsiveUI";

export default function AuthScreen() {
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn();

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState<"guest" | "admin">("guest");
  
  const [countdown, setCountdown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [showResendWarning, setShowResendWarning] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pendingVerification && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [pendingVerification, countdown]);

  if (!isSignUpLoaded || !isSignInLoaded) return null;

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) {
      return "Password must be at least 8 characters.";
    }
    const hasUppercase = /[A-Z]/.test(pwd);
    const hasLowercase = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      return "Passwords must contain an uppercase letter, a lowercase letter, and a number.";
    }
    if (!hasSpecialChar) {
      return "Passwords must contain at least one special character.";
    }
    return null;
  };

  const handleAuthError = (err: any, fallbackMessage: string) => {
    console.error("[DEV LOG] Auth Error:", err); // Keep raw errors for developers!
    
    let msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || fallbackMessage;
    const lowerMsg = String(msg).toLowerCase();
    
    // Sanitize technical errors
    if (lowerMsg.includes("captcha") || lowerMsg.includes("turnstile")) {
      msg = "Security verification failed. Please check your network connection or try refreshing.";
    } else if (lowerMsg.includes("network") || lowerMsg.includes("fetch")) {
      msg = "A network error occurred. Please check your internet connection.";
    }
    
    setError(msg);
  };

  const handlePasskeySignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const completeSignIn = await signIn.authenticateWithPasskey();
      if (completeSignIn.status === "complete") {
        await setSignInActive({ session: completeSignIn.createdSessionId });
      }
    } catch (err: any) {
      console.log(err);
      handleAuthError(err, "Passkey sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    setLoading(true);
    setError("");
    try {
      if (isForgotPasswordMode) {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: emailAddress,
        });
        setCountdown(60);
        setResendCount(0);
        setShowResendWarning(false);
        setPendingVerification(true);
      } else if (isLoginMode) {
        // LOGIN FLOW (Password)
        const completeSignIn = await signIn.create({
          identifier: emailAddress,
          password: password,
        });
        if (completeSignIn.status === "complete") {
          await setSignInActive({ session: completeSignIn.createdSessionId });
        } else {
          setError("Failed to sign in. Please check your credentials.");
        }
      } else {
        // REGISTER FLOW
        const validationError = validatePassword(password);
        if (validationError) {
          setError(validationError);
          setLoading(false);
          return;
        }

        if (selectedRole === 'admin') {
          const email = emailAddress.toLowerCase().trim();
          const domain = email.split('@')[1];
          const publicDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com'];
          
          if (!domain || publicDomains.includes(domain)) {
            setError("Admins must register with a corporate email address. Public domains are not allowed.");
            setLoading(false);
            return;
          }
        }

        await signUp.create({
          emailAddress,
          password: password,
        });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setCountdown(60);
        setResendCount(0);
        setShowResendWarning(false);
        setPendingVerification(true);
      }
    } catch (err: any) {
      handleAuthError(err, "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    setLoading(true);
    setError("");
    try {
      if (isForgotPasswordMode) {
        const validationError = validatePassword(password);
        if (validationError) {
          setError(validationError);
          setLoading(false);
          return;
        }

        const completeSignIn = await signIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code,
          password: password,
        });
        if (completeSignIn.status === "complete") {
          await setSignInActive({ session: completeSignIn.createdSessionId });
        } else {
          setError("Failed to reset password.");
        }
      } else {
        // OTP is only for Registration in this new flow
        const completeSignUp = await signUp.attemptEmailAddressVerification({ code });
        if (completeSignUp.status === "complete") {
          const { Platform } = require('react-native');
          if (Platform.OS !== 'web') {
            const SecureStore = require('expo-secure-store');
            await SecureStore.setItemAsync('requested_role', selectedRole);
          } else {
            localStorage.setItem('requested_role', selectedRole);
          }
          await setSignUpActive({ session: completeSignUp.createdSessionId });
        } else {
          setError(`Sign Up incomplete: missing ${completeSignUp.missingFields?.join(", ")}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      handleAuthError(err, "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    
    if (resendCount >= 2) {
      setShowResendWarning(true);
    }
    
    setLoading(true);
    setError("");
    try {
      if (isForgotPasswordMode) {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: emailAddress,
        });
      } else {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      }
      setCountdown(60);
      setResendCount(prev => prev + 1);
    } catch (err: any) {
      handleAuthError(err, "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-neutral-900 items-center justify-center p-6">
      <View className="w-full max-w-sm bg-neutral-800 p-8 rounded-3xl shadow-xl border border-neutral-700">

        <View className="items-center mb-6 w-full">
            <Image
              source={require('../FireVision.png')}
              style={{ width: '100%', height: 100, marginBottom: 16 }}
              resizeMode="contain"
            />
            <Text className="text-white text-2xl font-black uppercase tracking-widest text-center">
              Evacuation App
            </Text>
        </View>

        {!pendingVerification && !isForgotPasswordMode && (
          <View className="flex-row mb-6 bg-neutral-900 rounded-xl p-1 border border-neutral-700">
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-lg items-center ${isLoginMode && !isForgotPasswordMode ? 'bg-red-600' : 'bg-transparent'}`}
              onPress={() => { setIsLoginMode(true); setIsForgotPasswordMode(false); setError(""); }}
            >
              <Text className={`font-bold ${isLoginMode && !isForgotPasswordMode ? 'text-white' : 'text-neutral-400'}`}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-lg items-center ${!isLoginMode && !isForgotPasswordMode ? 'bg-red-600' : 'bg-transparent'}`}
              onPress={() => { setIsLoginMode(false); setIsForgotPasswordMode(false); setError(""); }}
            >
              <Text className={`font-bold ${!isLoginMode && !isForgotPasswordMode ? 'text-white' : 'text-neutral-400'}`}>Register</Text>
            </TouchableOpacity>
          </View>
        )}

        {error ? <Text className="text-red-400 text-center mb-4">{error}</Text> : null}

        {!pendingVerification ? (
          <>
            <TextInput
              className="bg-neutral-900 border border-neutral-700 text-white rounded-xl px-4 py-4 mb-4 text-lg"
              autoCapitalize="none"
              placeholder="name@example.com"
              placeholderTextColor="#666"
              keyboardType="email-address"
              value={emailAddress}
              onChangeText={setEmailAddress}
              editable={!loading}
            />

            {!isForgotPasswordMode && (
              <TextInput
                className="bg-neutral-900 border border-neutral-700 text-white rounded-xl px-4 py-4 mb-4 text-lg"
                autoCapitalize="none"
                placeholder="Password"
                placeholderTextColor="#666"
                secureTextEntry={true}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            )}

            {!isLoginMode && !isForgotPasswordMode && (
              <View className="mb-4 mt-2">
                <Text className="text-neutral-400 text-xs text-center mb-2">Select your role:</Text>
                <View className="flex-row bg-neutral-900 rounded-xl p-1 border border-neutral-700">
                  <TouchableOpacity 
                    className={`flex-1 py-3 rounded-lg items-center ${selectedRole === 'guest' ? 'bg-neutral-700' : 'bg-transparent'}`}
                    onPress={() => setSelectedRole('guest')}
                  >
                    <Text className={`font-bold ${selectedRole === 'guest' ? 'text-white' : 'text-neutral-400'}`}>Guest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className={`flex-1 py-3 rounded-lg items-center ${selectedRole === 'admin' ? 'bg-neutral-700' : 'bg-transparent'}`}
                    onPress={() => setSelectedRole('admin')}
                  >
                    <Text className={`font-bold ${selectedRole === 'admin' ? 'text-white' : 'text-neutral-400'}`}>Admin</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isLoginMode && !isForgotPasswordMode && (
              <TouchableOpacity className="mb-4 items-end" onPress={() => setIsForgotPasswordMode(true)}>
                <Text className="text-red-400 text-sm">Forgot Password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              className={`bg-red-600 border border-neutral-700 rounded-xl py-4 items-center mb-4 ${loading ? 'opacity-50' : 'opacity-100'}`}
              onPress={handleAuth}
              disabled={loading || emailAddress.length < 5 || (!isForgotPasswordMode && password.length < 4)}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-lg">
                  {isForgotPasswordMode ? "Send Reset Code" : isLoginMode ? "Sign In" : "Register"}
                </Text>
              )}
            </TouchableOpacity>
            
            {isForgotPasswordMode && (
               <TouchableOpacity className="mb-4" onPress={() => setIsForgotPasswordMode(false)}>
                  <Text className="text-neutral-400 text-center">Back to Login</Text>
               </TouchableOpacity>
            )}

            {isLoginMode && !isForgotPasswordMode && (
              <View className="flex-row items-center mb-4 mt-2">
                <View className="flex-1 h-px bg-neutral-700" />
                <Text className="text-neutral-500 px-4 text-xs font-bold">OR USE BIOMETRICS</Text>
                <View className="flex-1 h-px bg-neutral-700" />
              </View>
            )}

            {isLoginMode && !isForgotPasswordMode && (
              <TouchableOpacity 
                className={`bg-neutral-800 rounded-xl py-4 items-center flex-row justify-center mb-4 ${loading ? 'opacity-50' : 'opacity-100'}`}
                onPress={handlePasskeySignIn}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text className="text-2xl mr-2">🔑</Text>
                    <Text className="text-white font-extrabold text-lg">Sign in with Passkey</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Text className="text-white text-center font-bold mb-4">
              {isForgotPasswordMode ? "Reset your password" : "Verify your email"}
            </Text>
            <Text className="text-neutral-400 text-center text-sm mb-6">
              We sent a 6-digit code to your email. Enter it below.
            </Text>

            <TextInput
              className="bg-neutral-900 border border-neutral-700 text-white rounded-xl px-4 py-4 mb-4 text-lg text-center tracking-[1em]"
              placeholder="123456"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!loading}
            />

            {isForgotPasswordMode && (
              <TextInput
                className="bg-neutral-900 border border-neutral-700 text-white rounded-xl px-4 py-4 mb-6 text-lg"
                autoCapitalize="none"
                placeholder="New Password"
                placeholderTextColor="#666"
                secureTextEntry={true}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            )}

            <TouchableOpacity 
              className={`bg-red-600 rounded-xl py-4 items-center ${loading ? 'opacity-50' : 'opacity-100'}`}
              onPress={verifyOTP}
              disabled={loading || code.length !== 6 || (isForgotPasswordMode && password.length < 4)}
            >
              {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{isForgotPasswordMode ? "Reset Password & Login" : "Verify & Login"}</Text>}
            </TouchableOpacity>

            {showResendWarning && (
              <View className="mt-4 p-3 bg-red-900/30 border border-red-500 rounded-xl">
                <Text className="text-red-400 text-center text-xs">
                  Please check your junk email and domain credentials. If you still don't receive the code, wait 60 seconds and try again.
                </Text>
              </View>
            )}

            <TouchableOpacity 
              className={`mt-6 ${countdown > 0 || loading ? 'opacity-50' : ''}`} 
              onPress={handleResendCode}
              disabled={countdown > 0 || loading}
            >
              <Text className="text-neutral-300 text-center font-bold">
                {countdown > 0 ? `Resend Code in ${countdown}s` : "Didn't receive code? Resend"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity className="mt-6" onPress={() => setPendingVerification(false)}>
              <Text className="text-neutral-500 text-center">Back to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
