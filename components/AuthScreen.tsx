import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSignIn, useSignUp } from "@clerk/clerk-expo";

export default function AuthScreen() {
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn();

  const [emailAddress, setEmailAddress] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isSignUpLoaded || !isSignInLoaded) return null;

  const requestOTP = async () => {
    setLoading(true);
    setError("");
    try {
      // Try to sign in first
      try {
        const { supportedFirstFactors } = await signIn.create({
          identifier: emailAddress,
        });

        const isEmailFactor = supportedFirstFactors?.find(
          (factor) => factor.strategy === "email_code"
        );

        if (isEmailFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: isEmailFactor.emailAddressId,
          });
          setPendingVerification(true);
          setLoading(false);
          return;
        }
      } catch (err: any) {
        // If user doesn't exist, Clerk throws an error, so we sign up instead
        if (err.errors && err.errors[0]?.code === "form_identifier_not_found") {
          await signUp.create({
            emailAddress: emailAddress,
            password: "FireVision" + Math.random().toString(36).slice(-8) + "1!A",
          });
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
          setPendingVerification(true);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    setLoading(true);
    setError("");
    try {
      // If we are in sign up flow
      if (signUp.unverifiedFields.includes("email_address")) {
        const completeSignUp = await signUp.attemptEmailAddressVerification({ code });
        if (completeSignUp.status === "complete") {
          await setSignUpActive({ session: completeSignUp.createdSessionId });
        } else {
          setError(`Sign Up incomplete: missing ${completeSignUp.missingFields?.join(", ")}`);
        }
      } else {
        // We are in sign in flow
        const completeSignIn = await signIn.attemptFirstFactor({ strategy: "email_code", code });
        if (completeSignIn.status === "complete") {
          await setSignInActive({ session: completeSignIn.createdSessionId });
        } else {
          setError(`Sign In incomplete: status is ${completeSignIn.status}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.errors?.[0]?.message || err.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-neutral-900 items-center justify-center p-6">
      <View className="w-full max-w-sm bg-neutral-800 p-8 rounded-3xl shadow-xl border border-neutral-700">
        <Text className="text-3xl font-extrabold text-white mb-2 text-center">FireVision</Text>
        <Text className="text-neutral-400 mb-8 text-center">Enter your email to continue</Text>

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
            <TouchableOpacity 
              className={`bg-red-600 rounded-xl py-4 items-center ${loading ? 'opacity-50' : 'opacity-100'}`}
              onPress={requestOTP}
              disabled={loading || emailAddress.length < 5}
            >
              {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Send Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
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
            <TouchableOpacity 
              className={`bg-red-600 rounded-xl py-4 items-center ${loading ? 'opacity-50' : 'opacity-100'}`}
              onPress={verifyOTP}
              disabled={loading || code.length !== 6}
            >
              {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Verify & Login</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity className="mt-4" onPress={() => setPendingVerification(false)}>
               <Text className="text-neutral-400 text-center">Use a different email</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
