import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';

class Loan {
  String name;
  double amount;
  double interest;
  int creditScore;
  double monthlyPayment;
  bool showOnChart;

  Loan({
    String? name,
    required this.amount,
    required this.interest,
    required this.creditScore,
    required this.monthlyPayment,
    this.showOnChart = true,
  }) : name = (name == null || name.trim().isEmpty) ? '' : name;

  /// Returns the month at which the loan is fully paid off, or null if it never pays off
  int? get payoffMonth {
    double balance = amount;
    double monthlyRate = interest / 100 / 12;
    for (int i = 1; i <= 360; i++) {
      balance = balance * (1 + monthlyRate) - monthlyPayment;
      if (balance <= 0) return i;
    }
    return null;
  }

  /// True if monthly payment doesn't cover the first month's interest,
  /// meaning the balance will grow forever and can never be paid off.
  bool get cannotPayOff {
    final minPayment = amount * (interest / 100 / 12);
    return monthlyPayment <= minPayment;
  }

  /// Minimum payment needed to make any progress on the principal
  double get minimumPayment {
    return amount * (interest / 100 / 12);
  }
}

class LoansPage extends StatefulWidget {
  const LoansPage({super.key});

  @override
  State<LoansPage> createState() => _LoansPageState();
}

class _LoansPageState extends State<LoansPage> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController amountController = TextEditingController();
  final TextEditingController interestController = TextEditingController();
  final TextEditingController creditController = TextEditingController();
  final TextEditingController paymentController = TextEditingController();

  List<Loan> loans = [];

  final Color primaryOrange = const Color(0xFFFF8C00);
  final Color background = const Color(0xFFFFF8F0);

  final List<List<Color>> gradients = [
    [Color(0xFFFF8C00), Color(0xFFFFB347)],
    [Color(0xFF1E88E5), Color(0xFF64B5F6)],
    [Color(0xFF43A047), Color(0xFF81C784)],
    [Color(0xFFE53935), Color(0xFFEF9A9A)],
    [Color(0xFF8E24AA), Color(0xFFCE93D8)],
    [Color(0xFF00897B), Color(0xFF80CBC4)],
  ];

  List<FlSpot> generateSpots(Loan loan) {
    double balance = loan.amount;
    double monthlyRate = loan.interest / 100 / 12;

    List<FlSpot> spots = [FlSpot(0, balance)];

    for (int i = 1; i <= 360; i++) {
      balance = balance * (1 + monthlyRate) - loan.monthlyPayment;
      if (balance <= 0) {
        spots.add(FlSpot(i.toDouble(), 0));
        break;
      }
      spots.add(FlSpot(i.toDouble(), balance));
    }

    return spots;
  }

  double get chartMaxX {
    if (loans.isEmpty) return 120;
    double maxMonth = 0;
    for (final loan in loans) {
      if (!loan.showOnChart) continue;
      final spots = generateSpots(loan);
      if (spots.isNotEmpty) {
        maxMonth = maxMonth < spots.last.x ? spots.last.x : maxMonth;
      }
    }
    return maxMonth > 0 ? (maxMonth + 6).ceilToDouble() : 120;
  }

  double get chartMaxY {
    if (loans.isEmpty) return 50000;
    double maxAmount = loans
        .where((l) => l.showOnChart)
        .fold(0.0, (prev, l) => l.amount > prev ? l.amount : prev);
    if (maxAmount == 0) return 50000;
    double interval = _yInterval(maxAmount * 1.1);
    return ((maxAmount * 1.1) / interval).ceil() * interval;
  }

  double _yInterval(double maxY) {
    // Target at most ~5 labels on the Y axis to prevent crowding.
    const maxLabels = 5;
    final candidates = [
      500.0, 1000.0, 2500.0, 5000.0, 10000.0,
      25000.0, 50000.0, 100000.0, 250000.0, 500000.0,
    ];
    for (final c in candidates) {
      if (maxY / c <= maxLabels) return c;
    }
    return 500000.0;
  }

  /// Returns a clean X-axis interval that avoids label crowding.
  /// Targets roughly 6–8 labels across the chart width.
  double _xInterval(double maxX) {
    final candidates = [6.0, 12.0, 18.0, 24.0, 36.0, 48.0, 60.0];
    for (final c in candidates) {
      if (maxX / c <= 8) return c;
    }
    return 60.0;
  }

  List<LineChartBarData> buildLines() {
    List<LineChartBarData> lines = [];
    for (int i = 0; i < loans.length; i++) {
      if (!loans[i].showOnChart) continue;
      if (loans[i].cannotPayOff) continue;
      final colors = gradients[i % gradients.length];
      lines.add(
        LineChartBarData(
          spots: generateSpots(loans[i]),
          isCurved: true,
          gradient: LinearGradient(colors: colors),
          barWidth: 3,
          isStrokeCapRound: true,
          dotData: const FlDotData(show: false),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: colors.map((c) => c.withOpacity(0.15)).toList(),
            ),
          ),
        ),
      );
    }
    return lines;
  }

  LineChartData chartData() {
    final maxY = chartMaxY;
    final maxX = chartMaxX;
    final yInterval = _yInterval(maxY);
    final xInterval = _xInterval(maxX);

    return LineChartData(
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        horizontalInterval: yInterval,
        getDrawingHorizontalLine: (value) => FlLine(
          color: Colors.grey.withOpacity(0.15),
          strokeWidth: 1,
        ),
      ),
      titlesData: FlTitlesData(
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        bottomTitles: AxisTitles(
          axisNameWidget: const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text("Months", style: TextStyle(fontSize: 11, color: Colors.grey)),
          ),
          axisNameSize: 20,
          sideTitles: SideTitles(
            showTitles: true,
            interval: xInterval,
            reservedSize: 28,
            getTitlesWidget: (value, meta) {
              // Skip 0 and the very last tick to prevent edge overlap
              if (value == 0 || value == meta.max) return const SizedBox.shrink();
              return SideTitleWidget(
                meta: meta,
                space: 6,
                child: Text(
                  "${value.toInt()}",
                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                ),
              );
            },
          ),
        ),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            interval: yInterval,
            reservedSize: 62,
            getTitlesWidget: (value, meta) {
              // Skip 0 and the very top tick to prevent edge overlap
              if (value == 0 || value == meta.max) return const SizedBox.shrink();
              final label = value >= 1000
                  ? "\$${(value / 1000).toStringAsFixed(0)}k"
                  : "\$${value.toInt()}";
              return SideTitleWidget(
                meta: meta,
                space: 6,
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                ),
              );
            },
          ),
        ),
      ),
      borderData: FlBorderData(show: false),
      minX: 0,
      maxX: maxX,
      minY: 0,
      maxY: maxY,
      lineBarsData: buildLines(),
    );
  }

  void addLoan() {
    final String name = nameController.text.trim();
    final double amount = double.tryParse(amountController.text) ?? 0;
    final double interest = double.tryParse(interestController.text) ?? 0;
    final int credit = int.tryParse(creditController.text) ?? 0;
    final double payment = double.tryParse(paymentController.text) ?? 0;

    if (amount <= 0 || interest <= 0 || payment <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please enter valid loan amount, interest rate, and monthly payment."),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    final newLoan = Loan(
      name: name.isEmpty ? "Loan ${loans.length + 1}" : name,
      amount: amount,
      interest: interest,
      creditScore: credit,
      monthlyPayment: payment,
      showOnChart: !Loan(
        amount: amount,
        interest: interest,
        creditScore: credit,
        monthlyPayment: payment,
      ).cannotPayOff,
    );

    if (newLoan.cannotPayOff) {
      final minPayment = newLoan.minimumPayment;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "This loan can't be paid off — payment \$${payment.toStringAsFixed(2)} doesn't cover the monthly interest. "
            "Minimum needed: \$${minPayment.toStringAsFixed(2)}. Not shown on chart.",
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Colors.red.shade700,
          duration: const Duration(seconds: 5),
        ),
      );
    }

    setState(() {
      loans.add(newLoan);
    });

    nameController.clear();
    amountController.clear();
    interestController.clear();
    creditController.clear();
    paymentController.clear();
  }

  Widget _buildInputCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Loan name — full width
          TextField(
            controller: nameController,
            style: const TextStyle(fontSize: 15),
            decoration: InputDecoration(
              labelText: "Loan Name (optional)",
              hintText: "e.g. Car Loan, Student Loan",
              filled: true,
              fillColor: const Color(0xFFFFF8F0),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
              labelStyle: const TextStyle(fontSize: 13),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _inputField(
                controller: amountController,
                label: "Loan Amount",
                prefix: "\$",
                flex: 2,
              ),
              const SizedBox(width: 12),
              _inputField(
                controller: interestController,
                label: "Interest Rate",
                suffix: "%",
                flex: 1,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _inputField(
                controller: paymentController,
                label: "Monthly Payment",
                prefix: "\$",
                flex: 2,
              ),
              const SizedBox(width: 12),
              _inputField(
                controller: creditController,
                label: "Credit Score",
                flex: 1,
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: addLoan,
              icon: const Icon(Icons.add, size: 18),
              label: const Text("Add Loan", style: TextStyle(fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryOrange,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _inputField({
    required TextEditingController controller,
    required String label,
    String? prefix,
    String? suffix,
    int flex = 1,
  }) {
    return Expanded(
      flex: flex,
      child: TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: const TextStyle(fontSize: 15),
        decoration: InputDecoration(
          labelText: label,
          prefixText: prefix,
          suffixText: suffix,
          filled: true,
          fillColor: const Color(0xFFFFF8F0),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
          labelStyle: const TextStyle(fontSize: 13),
        ),
      ),
    );
  }

  Widget _buildLoanCard(int index, Loan loan) {
    final colors = gradients[index % gradients.length];
    final payoff = loan.payoffMonth;
    final years = payoff != null ? (payoff / 12).toStringAsFixed(1) : "∞";
    final payoffLabel = payoff != null ? "$payoff mo ($years yr)" : "Never";
    final unpayable = loan.cannotPayOff;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            IntrinsicHeight(
              child: Row(
                children: [
                  // Color swatch
                  Container(
                    width: 6,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: unpayable
                            ? [Colors.grey.shade400, Colors.grey.shade300]
                            : colors,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          // Toggle
                          Tooltip(
                            message: unpayable ? "Can't be shown — payment too low" : "",
                            child: Transform.scale(
                              scale: 0.85,
                              child: Switch(
                                value: unpayable ? false : loan.showOnChart,
                                activeColor: colors[0],
                                onChanged: unpayable
                                    ? null
                                    : (val) => setState(() => loan.showOnChart = val),
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          // Info
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  loan.name.isNotEmpty ? loan.name : "Loan \${loans.indexOf(loan) + 1}",
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: unpayable ? Colors.grey.shade400 : Colors.black87,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  "\$${loan.amount.toStringAsFixed(0)} · ${loan.interest}% APR · \$${loan.monthlyPayment.toStringAsFixed(0)}/mo",
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: unpayable
                                        ? Colors.grey.shade400
                                        : Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          // Payoff badge
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                "Payoff",
                                style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                              ),
                              Text(
                                payoffLabel,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: unpayable
                                      ? Colors.red.shade400
                                      : Colors.grey.shade700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 4),
                          // Delete
                          IconButton(
                            icon: Icon(Icons.close, size: 18, color: Colors.grey.shade400),
                            onPressed: () => setState(() => loans.removeAt(index)),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Warning banner for unpayable loans
            if (unpayable)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                color: Colors.red.shade50,
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, size: 14, color: Colors.red.shade400),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        "Payment too low to cover interest — not shown on chart. "
                        "Min needed: \$${loan.minimumPayment.toStringAsFixed(2)}/mo",
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.red.shade400,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildChart() {
    return Container(
      height: 260,
      padding: const EdgeInsets.fromLTRB(8, 16, 20, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: loans.where((l) => l.showOnChart).isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.show_chart, size: 40, color: Colors.grey.shade300),
                  const SizedBox(height: 8),
                  Text(
                    "Add a loan to see the chart",
                    style: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                  ),
                ],
              ),
            )
          : LineChart(chartData()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: background,
      appBar: AppBar(
        title: const Text(
          "Loan Analyzer",
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        backgroundColor: primaryOrange,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildChart(),

            const SizedBox(height: 24),

            if (loans.isNotEmpty) ...[
              Row(
                children: [
                  const Text(
                    "Your Loans",
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: primaryOrange.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      "${loans.length}",
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: primaryOrange,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ...loans.asMap().entries.map((e) => _buildLoanCard(e.key, e.value)),
              const SizedBox(height: 16),
            ],

            const Text(
              "Add Loan",
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            _buildInputCard(),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}