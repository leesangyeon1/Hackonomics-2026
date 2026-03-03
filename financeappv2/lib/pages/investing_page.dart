import 'package:flutter/material.dart';

class InvestingPage extends StatelessWidget {
  const InvestingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Investing'),
        backgroundColor: const Color(0xFFFFB300),
      ),
      body: const Center(
        child: Text(
          'Investing Page Content Here',
          style: TextStyle(fontSize: 24),
        ),
      ),
    );
  }
}